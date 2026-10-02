-- Reason: give send-event-reminders one atomic "claim this reminder or tell me someone else has" step, so a recipient can never be emailed the same reminder twice however often the job runs.
--
-- The claim has to be INSERT ... ON CONFLICT DO UPDATE ... WHERE: take the row
-- if it doesn't exist, take it over if the last attempt failed or died, and
-- return nothing at all if it is already sent or still in flight. PostgREST
-- can't express that conditional upsert, and splitting it into a select and an
-- insert would reopen exactly the race it exists to close — hence an RPC.
--
-- Returns the reminders_sent id to mark up afterwards, or null when the caller
-- must not send.

create or replace function public.claim_event_reminder(
  p_signup_id       uuid,
  p_reminder_type   text,
  p_event_starts_at timestamptz,
  p_stale_minutes   integer
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.reminders_sent (signup_id, reminder_type, event_starts_at, status, attempts, last_attempt_at)
  values (p_signup_id, p_reminder_type, p_event_starts_at, 'pending', 1, now())
  on conflict (signup_id, reminder_type, event_starts_at) do update
    set attempts        = reminders_sent.attempts + 1,
        last_attempt_at = now(),
        status          = 'pending',
        last_error      = null
    -- 'sent' is final and matches neither branch, so a reminder that went out
    -- is never claimed again — that is the no-double-send guarantee.
    --
    -- A failed send is retried on the very next run: the point of recording the
    -- failure is that it gets another go, not that it waits.
    --
    -- A row still 'pending' is either in flight right now or was left behind by
    -- a run that died mid-send. There is no way to tell from here, so it is
    -- left alone until p_stale_minutes has passed, which is set well above the
    -- time any single send can take.
    where reminders_sent.status = 'failed'
       or (
         reminders_sent.status = 'pending'
         and reminders_sent.last_attempt_at < now() - make_interval(mins => p_stale_minutes)
       )
  returning id;
$$;

-- Only the reminder job may call this. It writes to a table nobody else can
-- write to, so it must not be reachable from an admin session either.
revoke all on function public.claim_event_reminder(uuid, text, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.claim_event_reminder(uuid, text, timestamptz, integer) to service_role;
