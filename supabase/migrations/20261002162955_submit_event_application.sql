-- Reason: save an application and all of its answers in one transaction, so a half-saved application can never exist, and give the applicant a code they can quote.
--
-- The submit-application Edge Function can't do this from the client side:
-- supabase-js has no transactions, so an application row and its answers would
-- be two separate writes with a window in between. Everything below runs inside
-- one function call, so any failure rolls the whole submission back and the
-- function then deletes the CV it had already uploaded.
--
-- Access follows the record_diversity_answers precedent
-- (20260918210757_create_diversity_answer_counts.sql): EXECUTE revoked from
-- public/anon/authenticated and granted only to service_role, so the only
-- caller is the Edge Function.

-- ------------------------------------------------------ reference codes --

-- MUT-XXXXXX from a 30-character alphabet with the ambiguous glyphs removed
-- (no I, L, O, U, 0 or 1), so a code survives being read down a phone or copied
-- off a printout. ~729M combinations; the unique constraint on
-- event_applications.reference_code is the actual guarantee and the caller
-- retries on a clash.
--
-- This is NOT a capability: nothing anywhere looks an application up by its
-- code, so guessing one reveals nothing.
create function public.generate_application_reference()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select 'MUT-' || string_agg(
           substr('ABCDEFGHJKMNPQRSTVWXYZ23456789',
                  1 + floor(random() * 30)::integer, 1), '')
    from generate_series(1, 6);
$$;

revoke execute on function public.generate_application_reference() from public, anon, authenticated;
grant execute on function public.generate_application_reference() to service_role;

-- ---------------------------------------------------------- rate limiting --

-- In `private` because PostgREST doesn't expose that schema, and with no
-- policies and no grants to anon/authenticated: the SECURITY DEFINER wrapper
-- below is the only thing that can touch it, so the counters can't be read to
-- learn who applied or written to clear someone's limit.
--
-- `bucket` is an opaque key built by the caller — 'ip:<sha256>' or
-- 'email:<event_id>:<email>'. IPs arrive already hashed, so no raw visitor
-- address is ever stored here.
create table private.application_rate_limits (
  bucket       text not null,
  window_start timestamptz not null,
  attempts     integer not null default 0,
  primary key (bucket, window_start)
);

-- RLS on with deliberately NO policies. That denies every role except the table
-- owner, which is exactly what's wanted: the SECURITY DEFINER wrapper below runs
-- as the owner and is the only thing that should ever touch these counters.
--
-- The security advisor reports this as rls_enabled_no_policy (INFO). That notice
-- is expected here and must not be "fixed" by adding a policy — a policy would
-- only widen access. Same reasoning as audit_log having no UPDATE/DELETE policy.
alter table private.application_rate_limits enable row level security;

-- Counts this attempt and says whether it's allowed. Fixed windows rather than a
-- sliding log: one row per bucket per window, so spent counters just sit there
-- until the nightly prune in the purge-event-cvs schedule migration clears them.
-- This function only ever inserts or increments — nothing on the submission path
-- deletes anything.
create function public.consume_application_rate_limit(
  p_bucket         text,
  p_limit          integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_attempts     integer;
begin
  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into private.application_rate_limits as r (bucket, window_start, attempts)
  values (p_bucket, v_window_start, 1)
      on conflict (bucket, window_start)
      do update set attempts = r.attempts + 1
   returning r.attempts into v_attempts;

  return v_attempts <= p_limit;
end;
$$;

revoke execute on function public.consume_application_rate_limit(text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_application_rate_limit(text, integer, integer)
  to service_role;

-- ------------------------------------------------------- atomic submission --

-- p_answers is [{"question_id": uuid, "answer_text": text}, ...].
--
-- Everything the applicant sent is re-checked here against the questions as
-- they are right now, inside the transaction and with the event row locked.
-- That closes the race where an admin edits the questions while someone is
-- filling the form in: the submission is rejected rather than saved with
-- missing or stale answers. question_prompt is copied from event_questions, not
-- taken from the caller, so the snapshot can't be forged.
--
-- Errors are raised with a bare message the Edge Function maps to a response
-- code: event_not_open, questions_changed, invalid_answer, invalid_choice.
create function public.submit_event_application(
  p_application_id uuid,
  p_event_id       uuid,
  p_name           text,
  p_email          text,
  p_cv_path        text,
  p_cv_file_name   text,
  p_cv_size_bytes  integer,
  p_answers        jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_questions    jsonb;
  v_answer_count integer;
  v_code         text;
  v_submitted_at timestamptz;
  v_constraint   text;
  v_attempt      integer;
begin
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'invalid_answer';
  end if;

  -- FOR SHARE: an admin can't flip requires_application off, or unpublish the
  -- event, underneath this transaction.
  perform 1
     from public.events e
    where e.id = p_event_id
      and e.is_published
      and e.requires_application
      and e.signup_enabled
      for share;
  if not found then
    raise exception 'event_not_open';
  end if;

  -- The question set this submission is judged against, in display order.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', q.id,
               'prompt', q.prompt,
               'question_type', q.question_type,
               'options', q.options
             ) order by q.position, q.created_at
           ),
           '[]'::jsonb
         )
    into v_questions
    from public.event_questions q
   where q.event_id = p_event_id;

  -- Application mode with no questions isn't a usable form; treat it as closed
  -- rather than accepting an application with nothing in it.
  if jsonb_array_length(v_questions) = 0 then
    raise exception 'event_not_open';
  end if;

  select count(*), count(distinct a.value ->> 'question_id')
    into v_answer_count, v_attempt
    from jsonb_array_elements(p_answers) as a(value);

  -- Exactly one answer per live question, nothing unknown, nothing duplicated.
  -- The three checks together force a one-to-one match.
  if v_answer_count <> jsonb_array_length(v_questions)
     or v_attempt <> jsonb_array_length(v_questions)
     or exists (
          select 1
            from jsonb_array_elements(p_answers) as a(value)
           where not exists (
                   select 1
                     from jsonb_array_elements(v_questions) as q(value)
                    where q.value ->> 'id' = a.value ->> 'question_id'
                 )
        )
  then
    raise exception 'questions_changed';
  end if;

  if exists (
       select 1
         from jsonb_array_elements(v_questions) as q(value)
         join jsonb_array_elements(p_answers) as a(value)
           on a.value ->> 'question_id' = q.value ->> 'id'
        where btrim(coalesce(a.value ->> 'answer_text', '')) = ''
           or length(a.value ->> 'answer_text') > 2000
     )
  then
    raise exception 'invalid_answer';
  end if;

  -- A choice answer must be one of that question's own options.
  if exists (
       select 1
         from jsonb_array_elements(v_questions) as q(value)
         join jsonb_array_elements(p_answers) as a(value)
           on a.value ->> 'question_id' = q.value ->> 'id'
        where q.value ->> 'question_type' = 'single_choice'
          and not (q.value -> 'options' @> to_jsonb(btrim(a.value ->> 'answer_text')))
     )
  then
    raise exception 'invalid_choice';
  end if;

  -- A clashing reference code is retried; any other unique violation (the
  -- one-application-per-email index) is the caller's answer, so it re-raises
  -- and the Edge Function reports it as a duplicate.
  for v_attempt in 1 .. 10 loop
    v_code := public.generate_application_reference();
    begin
      insert into public.event_applications
        (id, event_id, name, email, cv_path, cv_file_name, cv_size_bytes, reference_code)
      values
        (p_application_id, p_event_id, btrim(p_name), lower(btrim(p_email)), p_cv_path,
         p_cv_file_name, p_cv_size_bytes, v_code)
      returning submitted_at into v_submitted_at;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint is distinct from 'event_applications_reference_code_key'
         or v_attempt >= 10 then
        raise;
      end if;
    end;
  end loop;

  -- question_position comes from the snapshot's ordinal, not from
  -- event_questions.position: positions aren't unique in that table, and
  -- application_answers is. A dense 0-based sequence is also exactly the order
  -- the receipt and the CSV want.
  insert into public.application_answers
    (application_id, question_id, question_prompt, question_position, answer_text)
  select p_application_id,
         (q.value ->> 'id')::uuid,
         q.value ->> 'prompt',
         (q.ordinality - 1)::integer,
         btrim(a.value ->> 'answer_text')
    from jsonb_array_elements(v_questions) with ordinality as q(value, ordinality)
    join jsonb_array_elements(p_answers) as a(value)
      on a.value ->> 'question_id' = q.value ->> 'id';

  return jsonb_build_object(
    'application_id', p_application_id,
    'reference_code', v_code,
    'submitted_at', v_submitted_at
  );
end;
$$;

revoke execute on function public.submit_event_application(uuid, uuid, text, text, text, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_event_application(uuid, uuid, text, text, text, text, integer, jsonb)
  to service_role;
