-- Reason: email everyone signed up for an event a reminder the day before it starts.
--
-- Every hour pg_cron calls the send-event-reminders Edge Function, which
-- emails events starting 23–25 hours from now. reminder_sent_at is set on the
-- event before its reminders go out, so no event is ever reminded twice.
-- Authenticates with the Vault secret created in the confirmation-emails
-- migration.

create extension if not exists pg_cron;
create extension if not exists pg_net schema extensions;

alter table public.events add column reminder_sent_at timestamptz;

-- The function only ever writes this one column.
grant update (reminder_sent_at) on table public.events to service_role;

select cron.schedule(
  'send-event-reminders',
  '0 * * * *',
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
