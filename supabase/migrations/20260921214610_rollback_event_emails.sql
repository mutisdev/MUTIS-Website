-- Reason: switch off the event confirmation and reminder emails for now; university inboxes aren't receiving them until the domain is trusted.
--
-- Undoes 20260921211745_event_signup_confirmation_emails and
-- 20260921211750_event_reminder_emails: removes the signup trigger, the hourly
-- cron job, the two *_sent_at columns and the shared Vault secret. No signup
-- or event rows are deleted.

select cron.unschedule('send-event-reminders')
where exists (select 1 from cron.job where jobname = 'send-event-reminders');

drop trigger if exists event_signups_send_confirmation on public.event_signups;
drop function if exists private.notify_event_signup();

alter table public.event_signups drop column if exists confirmation_sent_at;
alter table public.events drop column if exists reminder_sent_at;

delete from vault.secrets where name = 'email_webhook_secret';
