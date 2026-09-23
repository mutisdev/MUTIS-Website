-- Reason: switch the event confirmation and reminder emails back on so they can be tested again.
--
-- Re-applies 20260921211745_event_signup_confirmation_emails and
-- 20260921211750_event_reminder_emails, which 20260921214610_rollback_event_emails
-- undid. A fresh Vault secret is generated. Undo again with the rollback's SQL.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'email_webhook_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'email_webhook_secret');
  end if;
end;
$$;

alter table public.event_signups add column confirmation_sent_at timestamptz;

-- The function only ever writes this one column.
grant update (confirmation_sent_at) on table public.event_signups to service_role;

create or replace function private.notify_event_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://ktleyfwpcuyvvyxpvipp.supabase.co/functions/v1/send-signup-confirmation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_webhook_secret')
    ),
    body := jsonb_build_object('record_id', new.id),
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  -- Never let a problem queueing the email fail the signup itself.
  raise warning 'event signup % confirmation email not queued: %', new.id, sqlerrm;
  return new;
end;
$$;

revoke all on function private.notify_event_signup() from public, anon, authenticated;

create trigger event_signups_send_confirmation
  after insert on public.event_signups
  for each row
  when (new.status = 'confirmed')
  execute function private.notify_event_signup();

-- Reminders

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
