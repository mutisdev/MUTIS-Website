-- Reason: let admins put an event behind an application — their own questions plus a CV — instead of the one-click sign-up, so places can be reviewed before anyone is accepted.
--
-- Purely additive. requires_application defaults false, so every existing
-- event, every existing sign-up and the whole event_signups flow behave exactly
-- as they did before this ran.
--
-- The three new tables split along how long their contents live:
--   event_questions    — admin content, editable forever
--   event_applications — a submission; never rewritten, only its status moves
--   application_answers — immutable history, snapshotted so that editing or
--                         deleting a question later can't rewrite what someone
--                         actually answered
--
-- NOTE: private.is_admin(), not public.is_admin() — see
-- 20260916210000_move_is_admin_to_private_schema.sql.

alter table public.events
  add column requires_application boolean not null default false;

-- ---------------------------------------------------------------- questions --

create table public.event_questions (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  prompt        text not null check (btrim(prompt) <> '' and length(prompt) <= 300),
  question_type text not null check (question_type in ('short_text', 'long_text', 'single_choice')),
  options       jsonb not null default '[]'::jsonb,
  position      integer not null default 0 check (position >= 0),
  created_at    timestamptz not null default now(),
  -- A choice question needs at least two options; the other types carry none.
  -- Every option must be a non-blank string of at most 120 characters. The admin
  -- UI enforces the same rule, but it's stated here too so no other write path
  -- can get round it.
  --
  -- Written with jsonb_path_* rather than `not exists (select ...)` because a
  -- CHECK constraint can't contain a subquery. These functions are immutable,
  -- which a constraint requires; the _tz variants are not, so don't swap them in.
  constraint event_questions_options_shape check (
    jsonb_typeof(options) = 'array'
    and case
          when question_type = 'single_choice' then jsonb_array_length(options) between 2 and 20
          else jsonb_array_length(options) = 0
        end
    -- Every element is a string: filtering to the strings changes nothing.
    and jsonb_path_query_array(options, '$[*] ? (@.type() == "string")') = options
    and not jsonb_path_exists(options, '$[*] ? (@ like_regex "^[[:space:]]*$")')
    -- flag "s" so `.` spans newlines; a pasted multi-line option is still capped.
    and not jsonb_path_exists(options, '$[*] ? (@ like_regex "^.{121,}" flag "s")')
  )
);

-- Deliberately NOT unique on (event_id, position): saving a reorder rewrites
-- positions one row at a time, and a unique index would reject the legal
-- intermediate states. Ties break on created_at.
create index event_questions_event_position_idx
  on public.event_questions (event_id, position, created_at);

alter table public.event_questions enable row level security;

-- Readable with no session, because the public application form needs them.
-- Gated on requires_application as well as is_published, so turning the toggle
-- off hides the questions at the database level while keeping every row — which
-- is what makes the toggle non-destructive.
create policy "public read event_questions for application events" on public.event_questions
  for select
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.is_published and e.requires_application
    )
  );

create policy "admin read all event_questions" on public.event_questions
  for select using (private.is_admin());

create policy "admin write event_questions" on public.event_questions
  for all using (private.is_admin()) with check (private.is_admin());

grant select on table public.event_questions to anon, authenticated;
grant insert, update, delete on table public.event_questions to authenticated;
grant select on table public.event_questions to service_role;

-- ------------------------------------------------------------- applications --

create table public.event_applications (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  name           text not null check (btrim(name) <> '' and length(name) <= 200),
  email          text not null check (length(email) <= 320),
  -- Nulled out by purge-event-cvs once the retention period passes; the row,
  -- its answers and the file's name stay as the permanent record.
  cv_path        text,
  cv_file_name   text not null check (btrim(cv_file_name) <> '' and length(cv_file_name) <= 255),
  cv_size_bytes  integer not null check (cv_size_bytes > 0),
  status         text not null default 'pending'
                 check (status in ('pending', 'accepted', 'waitlisted', 'rejected')),
  reference_code text not null unique,
  submitted_at   timestamptz not null default now(),
  -- Stored lowercase and restricted to University of Manchester addresses, the
  -- same rule event_signups and membership_signups use. Keep in step with
  -- supabase/functions/_shared/uniEmail.ts and
  -- 20260918213104_normalise_emails_require_uni_domain.sql.
  constraint event_applications_email_normalised check (email = lower(email)),
  constraint event_applications_email_uni check (
    email ~ '^[^@[:space:]]+@(student\.manchester\.ac\.uk|postgrad\.manchester\.ac\.uk|manchester\.ac\.uk)$'
  ),
  -- The path is derived from ids, never from the uploaded file name, so the
  -- object and its row can never disagree and no name can escape the folder.
  constraint event_applications_cv_path_shape check (
    cv_path is null or cv_path = event_id::text || '/' || id::text || '.pdf'
  )
);

-- One application per person per event. Emails are already stored lowercase,
-- but lower() is applied here too so the index can't be bypassed by a future
-- write path that forgets (same idiom as
-- 20260915200000_event_signups_case_insensitive_dedupe.sql).
create unique index event_applications_event_email_key
  on public.event_applications (event_id, lower(email));
create index event_applications_event_submitted_idx
  on public.event_applications (event_id, submitted_at desc);
-- Drives the retention sweep.
create index event_applications_cv_path_idx
  on public.event_applications (event_id) where cv_path is not null;

alter table public.event_applications enable row level security;

-- Admin-only, and no insert policy for anybody: submit-application writes with
-- the service role, which bypasses RLS. anon gets no policy AND no grant, so a
-- direct PostgREST call fails on table privileges before RLS is consulted.
create policy "admin read event_applications" on public.event_applications
  for select using (private.is_admin());

create policy "admin update event_applications" on public.event_applications
  for update using (private.is_admin()) with check (private.is_admin());

create policy "admin delete event_applications" on public.event_applications
  for delete using (private.is_admin());

-- Column-level UPDATE: an admin can move the status and nothing else, so an
-- admin session can't rewrite an applicant's name, email or CV reference.
-- Mirrors the `grant update (reminder_sent_at)` precedent on public.events.
grant select, delete on table public.event_applications to authenticated;
grant update (status) on table public.event_applications to authenticated;
-- service_role bypasses RLS but PostgREST still checks table privileges — see
-- 20260917150000_grant_service_role_form_inserts.sql.
grant select, insert on table public.event_applications to service_role;
grant update (cv_path) on table public.event_applications to service_role;

-- ----------------------------------------------------------------- answers --

create table public.application_answers (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null references public.event_applications(id) on delete cascade,
  -- Nullable, with ON DELETE SET NULL rather than CASCADE: deleting a question
  -- must never delete what someone answered. question_prompt and
  -- question_position are snapshots taken at submission time, so the receipt,
  -- the admin view and the CSV all still read correctly afterwards.
  question_id       uuid references public.event_questions(id) on delete set null,
  question_prompt   text not null,
  question_position integer not null,
  answer_text       text not null check (btrim(answer_text) <> '' and length(answer_text) <= 2000),
  created_at        timestamptz not null default now(),
  unique (application_id, question_position)
);

create index application_answers_application_idx
  on public.application_answers (application_id, question_position);

alter table public.application_answers enable row level security;

-- Read and delete only. No UPDATE policy and no UPDATE grant at all: answers
-- are immutable through the API by construction, the same guarantee audit_log
-- has.
create policy "admin read application_answers" on public.application_answers
  for select using (private.is_admin());

create policy "admin delete application_answers" on public.application_answers
  for delete using (private.is_admin());

grant select, delete on table public.application_answers to authenticated;
grant select, insert on table public.application_answers to service_role;
