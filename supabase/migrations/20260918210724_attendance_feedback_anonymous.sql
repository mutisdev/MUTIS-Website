-- Reason: let event feedback be submitted anonymously, without a name, email, course or year.
--
-- The identity columns become optional here and are dropped in a later
-- migration. Timestamps default to midnight (UK time) so a response can't be
-- matched to the moment someone was seen filling in the form.

alter table public.attendance_submissions
  alter column name drop not null,
  alter column email drop not null,
  alter column course drop not null,
  alter column year drop not null,
  alter column created_at set default date_trunc('day', now(), 'Europe/London');

-- One-response-per-email no longer applies: responses carry no email.
drop index public.attendance_submissions_event_email_uidx;

-- 20260817100000_attendance_submissions_rating_max_5 was never applied to the
-- live database, which still allowed 1-10. Re-apply it here.
alter table public.attendance_submissions
  drop constraint attendance_submissions_rating_check,
  add constraint attendance_submissions_rating_check check (rating between 1 and 5) not valid;
