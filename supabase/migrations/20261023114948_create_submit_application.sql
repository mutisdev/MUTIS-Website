-- Reason: one atomic submission path for both events and positions, so a position application gets the same locked parent row, the same re-derived question set and the same all-or-nothing insert an event application already gets.
--
-- A new name rather than a changed signature, because the argument list grows
-- and a Postgres function can't be altered into a different arity: it has to be
-- dropped and recreated. Dropping submit_event_application here would break
-- live submissions for as long as the deploy took, so the old function stays
-- until the NEXT migration, which is applied after the Edge Function ships.
-- Same ordering rule as 20261002164635_schedule_purge_event_cvs.sql.
--
-- Everything that made submit_event_application trustworthy is preserved: the
-- FOR SHARE lock on whichever parent applies, re-deriving the question set
-- inside the transaction, the one-answer-per-live-question checks, the
-- choice-option check, the bounded reference-code retry loop, and
-- question_position taken from the snapshot's ordinality rather than from
-- event_questions.position.
--
-- Errors are raised with a bare message the Edge Function maps to a response
-- code: event_not_open, position_not_open, questions_changed, invalid_answer,
-- invalid_choice. Events keep raising event_not_open verbatim so their
-- user-facing wording doesn't move.
--
-- invalid_target is deliberately NOT in that map: it can only be a caller bug,
-- and a bug should surface as db_error rather than as advice to an applicant.
--
-- Note for anyone adding a code here: the Edge Function matches these names by
-- SUBSTRING, so a new one must never be a substring of another. In particular
-- never add a bare `not_open`.

create function public.submit_application(
  p_application_id uuid,
  p_event_id       uuid,
  p_position_id    uuid,
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

  -- The same rule the two one_target CHECK constraints enforce, checked up
  -- front so a both-null or both-set call fails on its own terms rather than
  -- as a constraint violation halfway through.
  if num_nonnulls(p_event_id, p_position_id) <> 1 then
    raise exception 'invalid_target';
  end if;

  if p_event_id is not null then
    -- FOR SHARE: an admin can't flip requires_application off, or unpublish
    -- the event, underneath this transaction.
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
  else
    -- The same lock for the same reason. Time passing isn't something a lock
    -- can hold still, but is_published, applications_open and closes_at can't
    -- be edited while this transaction runs, which is the race that matters.
    perform 1
       from public.positions p
      where p.id = p_position_id
        and p.is_published
        and p.applications_open
        and (p.closes_at is null or p.closes_at > now())
        for share;
    if not found then
      raise exception 'position_not_open';
    end if;
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
   where (p_event_id    is not null and q.event_id    = p_event_id)
      or (p_position_id is not null and q.position_id = p_position_id);

  -- A form with no questions isn't a usable form; treat it as closed rather
  -- than accepting an application with nothing in it. For a position this is
  -- also the whole of the "is there a form" gate, which is why that table has
  -- no requires_application column.
  if jsonb_array_length(v_questions) = 0 then
    if p_event_id is not null then
      raise exception 'event_not_open';
    else
      raise exception 'position_not_open';
    end if;
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

  -- A clashing reference code is retried; any other unique violation — now
  -- either event_applications_event_email_key or
  -- event_applications_position_email_key — is the caller's answer, so it
  -- re-raises and the Edge Function reports it as a duplicate. A partial
  -- unique index reports its own name as constraint_name, so the comparison
  -- below keeps working unchanged.
  for v_attempt in 1 .. 10 loop
    v_code := public.generate_application_reference();
    begin
      insert into public.event_applications
        (id, event_id, position_id, name, email, cv_path,
         cv_file_name, cv_size_bytes, reference_code)
      values
        (p_application_id, p_event_id, p_position_id, btrim(p_name),
         lower(btrim(p_email)), p_cv_path, p_cv_file_name, p_cv_size_bytes, v_code)
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

-- Same access shape as the function it supersedes: the Edge Function is the
-- only caller, and anon/authenticated must not be able to reach it through
-- /rest/v1/rpc.
revoke execute on function public.submit_application(uuid, uuid, uuid, text, text, text, text, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.submit_application(uuid, uuid, uuid, text, text, text, text, integer, jsonb)
  to service_role;
