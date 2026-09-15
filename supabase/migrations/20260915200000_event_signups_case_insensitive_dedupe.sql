-- unique (event_id, email) was case-sensitive, so "Jo@x.com" and "jo@x.com"
-- could both sign up for the same event. Replace it with a lower(email) index,
-- matching membership_signups_email_uidx and
-- attendance_submissions_event_email_uidx. Still raises 23505, which
-- EventSignup.tsx already maps to its "already signed up" message.
alter table public.event_signups
  drop constraint event_signups_event_id_email_key;

create unique index event_signups_event_email_uidx
  on public.event_signups (event_id, lower(email));
