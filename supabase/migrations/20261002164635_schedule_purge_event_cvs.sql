-- Reason: stop holding applicants' CVs once they can't still be needed, without anyone having to remember to delete them.
--
-- APPLY THIS LAST — after purge-event-cvs is deployed. Scheduling the job
-- before the function exists just means the first run 404s.
--
-- Note what is NOT here: how old a CV has to be. That number lives once, as
-- CV_RETENTION_DAYS in supabase/functions/_shared/eventApplications.ts, and the
-- function works out its own cut-off. This migration only says how often to
-- look, so the schedule and the retention period can't drift apart.
--
-- Authenticates with the existing `email_webhook_secret` Vault secret (created
-- in 20260921211745_event_signup_confirmation_emails.sql) and checked by
-- hasWebhookSecret(), so there's no new secret to provision.

create extension if not exists pg_cron;
-- extensions schema, not public (Supabase security advisor); its functions live in `net` either way.
create extension if not exists pg_net schema extensions;

-- 03:30 UTC daily. Nothing is time-critical — a CV sitting one extra hour is
-- fine — so this runs once a day, off-peak.
select cron.schedule(
  'purge-event-cvs',
  '30 3 * * *',
  $job$
  select net.http_post(
    url := 'https://ktleyfwpcuyvvyxpvipp.supabase.co/functions/v1/purge-event-cvs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_webhook_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);

-- Spent rate-limit counters, cleared nightly. Deliberately NOT done inside
-- consume_application_rate_limit: nothing on the submission path should delete
-- anything, so the one DELETE in this feature lives here, on a schedule, where
-- it is easy to find and reason about.
--
-- Only touches private.application_rate_limits, and only rows whose window
-- closed over 48 hours ago — well past the longest window (24h), so a live
-- counter is never cleared. No application, sign-up or feedback row is
-- reachable from here.
select cron.schedule(
  'prune-application-rate-limits',
  '45 3 * * *',
  $job$
  delete from private.application_rate_limits
   where window_start < now() - interval '48 hours';
  $job$
);
