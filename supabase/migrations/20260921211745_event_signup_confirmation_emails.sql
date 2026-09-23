-- Reason: email everyone a confirmation as soon as they sign up for an event.
--
-- An AFTER INSERT trigger on event_signups asks pg_net to call the
-- send-signup-confirmation Edge Function. pg_net queues the request and only
-- sends it after the insert commits, so email problems can never block or
-- undo a signup. The function authenticates with a random shared secret that
-- lives only in Vault (generated here, never in source control) and is also
-- used by send-event-reminders.
--
-- confirmation_sent_at records that the email went out, so a repeated call
-- for the same signup never sends a second one.

create extension if not exists pg_net schema extensions;

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
