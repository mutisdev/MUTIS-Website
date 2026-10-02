-- Reason: let admins attach a video conference joining block to an event, send it only in email, and add a second reminder an hour before the start for the events that have one.
--
-- Purely additive. An event with no event_video_details row behaves exactly as
-- it does today: one 24h reminder, no joining block anywhere.
--
-- Two tables, split by what they are for:
--   event_video_details — admin content, editable forever, NEVER public
--   reminders_sent      — one row per (sign-up, reminder, start time); the
--                         permanent record of what was sent, which is also what
--                         stops anything being sent twice
--
-- NOTE: private.is_admin(), not public.is_admin() — see
-- 20260916210000_move_is_admin_to_private_schema.sql.

-- ------------------------------------------------------------ video details --

-- Deliberately NOT a column on public.events. Every public events query reads
-- that row (the website selects *), so a column there would be one forgotten
-- select away from publishing a joining link to anyone who asked for the events
-- list. A separate table with no anon policy AND no anon grant cannot leak that
-- way: a direct PostgREST call fails on table privileges before RLS is even
-- consulted, exactly as event_applications does.
create table public.event_video_details (
  -- One block per event, so the event id is the key: there is nothing to
  -- reorder and no second row to disambiguate.
  event_id   uuid primary key references public.events(id) on delete cascade,
  -- The admin toggle. Off keeps the text (turning the toggle off must never
  -- destroy what was typed) while stopping it reaching any email, and it is the
  -- flag the reminder job reads to decide whether this event gets a 1h
  -- reminder at all.
  is_enabled boolean not null default true,
  -- Plain text: a link plus whatever meeting ID, passcode or joining notes the
  -- admin pastes in. Never HTML. See supabase/functions/_shared/eventVideo.ts,
  -- which holds the same limit for the form, and escapes and linkifies this on
  -- the way into an email.
  body_text  text not null check (btrim(body_text) <> '' and length(body_text) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A block with no joining link reads as though it were complete, which is
  -- worse than having none. The admin form says the same thing in words; it is
  -- stated here too so no other write path can get round it. Only https: every
  -- provider has been https-only for years and eventVideo.ts linkifies nothing
  -- else, so an http link would render as dead text.
  constraint event_video_details_has_https_link check (body_text like '%https://%')
);

alter table public.event_video_details enable row level security;

-- Admin-only, in full. There is no public policy and no anon grant, which is
-- the whole point of this table.
create policy "admin read event_video_details" on public.event_video_details
  for select using (private.is_admin());

create policy "admin write event_video_details" on public.event_video_details
  for all using (private.is_admin()) with check (private.is_admin());

grant select, insert, update, delete on table public.event_video_details to authenticated;
-- The email functions read it with the service role, which bypasses RLS but
-- still needs the table privilege — see
-- 20260917150000_grant_service_role_form_inserts.sql.
grant select on table public.event_video_details to service_role;
-- Belt and braces: nothing is granted to anon above, and nothing can be.
revoke all on table public.event_video_details from anon;

-- --------------------------------------------------------------- reminders --

create table public.reminders_sent (
  id             uuid primary key default gen_random_uuid(),
  signup_id      uuid not null references public.event_signups(id) on delete cascade,
  reminder_type  text not null check (reminder_type in ('24h', '1h')),
  -- The event start this reminder was sent FOR. Part of the uniqueness key, so
  -- re-timing an event automatically re-arms its reminders without anything
  -- being deleted: rows recorded against the old start no longer match, and the
  -- reminders whose windows have already passed under the new start are skipped
  -- by the job's window check rather than fired late. That keeps the send
  -- history intact and keeps row cleanup off the request path.
  event_starts_at timestamptz not null,
  -- 'pending' is a claim taken before the email is handed to Brevo, so a run
  -- that overlaps another never double-sends. 'failed' rows are picked up again
  -- on the next run; only 'sent' is final.
  status         text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts       integer not null default 1 check (attempts > 0),
  last_attempt_at timestamptz not null default now(),
  -- Why the last attempt failed, so a silent drop is impossible to mistake for
  -- a success when reading this table back.
  last_error     text,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  constraint reminders_sent_sent_at_matches_status check ((status = 'sent') = (sent_at is not null))
);

-- The guarantee that nothing is sent twice, however often the job runs.
create unique index reminders_sent_signup_type_start_key
  on public.reminders_sent (signup_id, reminder_type, event_starts_at);
-- Reading an event's send history back.
create index reminders_sent_signup_idx on public.reminders_sent (signup_id, last_attempt_at desc);

alter table public.reminders_sent enable row level security;

-- Admins can read the record; nobody can edit it through the API. No anon
-- policy and no anon grant.
create policy "admin read reminders_sent" on public.reminders_sent
  for select using (private.is_admin());

grant select on table public.reminders_sent to authenticated;
grant select, insert, update on table public.reminders_sent to service_role;
revoke all on table public.reminders_sent from anon;

-- ------------------------------------------------------------------- cron --

-- Every 5 minutes instead of hourly: the 1h reminder's window is 20 minutes
-- wide, so an hourly job would miss it outright. The 24h reminder is unaffected
-- — it keeps its hour of slack — and the job is a no-op on the runs where
-- nothing is due.
select cron.unschedule('send-event-reminders')
where exists (select 1 from cron.job where jobname = 'send-event-reminders');

select cron.schedule(
  'send-event-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ktleyfwpcuyvvyxpvipp.supabase.co/functions/v1/send-event-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_webhook_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
