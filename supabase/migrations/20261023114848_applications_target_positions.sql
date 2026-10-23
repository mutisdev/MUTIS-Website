-- Reason: let an application belong to a position as well as to an event, so positions reuse the one admin inbox, one submit function, one CV bucket and one receipt email instead of growing a second pipeline alongside the first.
--
-- Purely additive and purely DDL. Every existing question, application and CV
-- object keeps event_id set and position_id null, and every existing index,
-- policy and grant on the event path is left exactly as it was.
--
-- Shape: nullable event_id, nullable position_id, exactly one of the two set.
-- NOT a (target_type, target_id) pair, because that gives up the foreign key
-- and with it ON DELETE CASCADE, which is the only thing stopping a deleted
-- listing from leaving orphaned questions and applications behind.
--
-- The table names stay event_questions / event_applications. Renaming them to
-- application_questions / applications would read more honestly and would also
-- invalidate database.types.ts, every client query, useAdminMutation's
-- ContentTable literals and — unfixably — the table_name recorded on every
-- historic audit_log row. The names are a misnomer; that is the cheaper of the
-- two problems.
--
-- NOTE: private.is_admin(), not public.is_admin() — see
-- 20260916210000_move_is_admin_to_private_schema.sql.

-- ---------------------------------------------------------------- questions --

alter table public.event_questions
  alter column event_id drop not null;

alter table public.event_questions
  add column position_id uuid references public.positions(id) on delete cascade;

alter table public.event_questions
  add constraint event_questions_one_target
  check (num_nonnulls(event_id, position_id) = 1);

-- Mirrors event_questions_event_position_idx, and deliberately NOT unique on
-- (position_id, position) for the same reason: saving a reorder rewrites
-- positions one row at a time, and a unique index would reject the legal
-- intermediate states. Ties break on created_at.
create index event_questions_position_position_idx
  on public.event_questions (position_id, position, created_at);

-- An ADDITIONAL policy, not a rewrite of "public read event_questions for
-- application events". Permissive policies are OR'd together, so adding one
-- here cannot change what the event branch returns — which is the point: the
-- existing policy is not touched at all.
--
-- now() in a USING clause is fine. A policy expression is re-evaluated per row
-- per query, so volatility is allowed here; it is CHECK constraints and index
-- expressions that require immutability, which is what forced the
-- jsonb_path_* idiom on event_questions_options_shape.
--
-- Gated on applications_open and closes_at as well as is_published, so closing
-- a round stops its questions being readable at the database level while every
-- row stays — the same non-destructive property requires_application gives an
-- event. A closed listing therefore returns zero questions, which is why the
-- public page must say "closed" from positions.closes_at rather than infer it
-- from an empty question list.
create policy "public read event_questions for open positions" on public.event_questions
  for select
  using (
    exists (
      select 1 from public.positions p
      where p.id = position_id
        and p.is_published
        and p.applications_open
        and (p.closes_at is null or p.closes_at > now())
    )
  );

-- ------------------------------------------------------------- applications --

alter table public.event_applications
  alter column event_id drop not null;

alter table public.event_applications
  add column position_id uuid references public.positions(id) on delete cascade;

alter table public.event_applications
  add constraint event_applications_one_target
  check (num_nonnulls(event_id, position_id) = 1);

-- Widened, not relaxed: the path is still derived from ids and nothing else,
-- so an object and its row still can't disagree and no uploaded file name can
-- escape its folder.
--
-- Existing event objects are NOT moved, and existing rows satisfy the first
-- branch character-for-character. A position's objects live under a
-- "positions/" prefix, which can never be mistaken for an event folder because
-- a uuid's text form is 36 characters with hyphens and can never be the
-- literal "positions". That is what makes this a constraint change with no
-- storage migration behind it.
alter table public.event_applications
  drop constraint event_applications_cv_path_shape;

alter table public.event_applications
  add constraint event_applications_cv_path_shape check (
    cv_path is null
    or (event_id    is not null and cv_path = event_id::text || '/' || id::text || '.pdf')
    or (position_id is not null and cv_path = 'positions/' || position_id::text || '/' || id::text || '.pdf')
  );

-- One application per person per position.
--
-- event_applications_event_email_key is deliberately left alone rather than
-- rebuilt as a partial index: a btree unique index treats NULLs as distinct,
-- so position rows (event_id null) never conflicted in it and never occupied
-- it. Touching a live unique index to achieve nothing would be the riskiest
-- line in this migration.
--
-- Two narrow partial indexes rather than one on
-- coalesce(event_id, position_id): the coalesce form would require dropping
-- and recreating that live index, it conflates two id spaces, and it would
-- admit a both-null row if the XOR check above were ever dropped.
--
-- lower() is applied even though emails are stored lowercase, so a future
-- write path that forgets can't bypass it — same idiom as
-- 20260915200000_event_signups_case_insensitive_dedupe.sql.
create unique index event_applications_position_email_key
  on public.event_applications (position_id, lower(email))
  where position_id is not null;

-- Mirrors event_applications_event_submitted_idx: the admin inbox's one query.
create index event_applications_position_submitted_idx
  on public.event_applications (position_id, submitted_at desc)
  where position_id is not null;

-- Mirrors event_applications_cv_path_idx; drives the position half of the
-- application_cv_retention view.
create index event_applications_position_cv_path_idx
  on public.event_applications (position_id)
  where cv_path is not null;
