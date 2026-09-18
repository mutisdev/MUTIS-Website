-- Reason: record which members attended which events, kept completely separate from their anonymous feedback.
--
-- Filled by the submit-form Edge Function when someone answers "Yes, I'm a
-- member" on the event feedback form. There is deliberately no link to
-- attendance_submissions (no shared id, and only the date is stored), so an
-- attendance record can't be tied to a particular rating or comment.
-- Members are matched to these rows by email at query time, so someone who
-- joins MUTIS later is still credited.
create table public.member_event_attendance (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  email       text not null,
  attended_on date not null default (now() at time zone 'Europe/London')::date,
  constraint member_event_attendance_event_email_key unique (event_id, email),
  constraint member_event_attendance_email_normalised check (email = lower(btrim(email))),
  constraint member_event_attendance_email_uni_domain check (
    email ~ '^[^\s@]+@(student\.manchester\.ac\.uk|postgrad\.manchester\.ac\.uk|manchester\.ac\.uk)$'
  )
);

create index member_event_attendance_email_idx on public.member_event_attendance (email);

alter table public.member_event_attendance enable row level security;

-- Written only by the service role (Edge Function), which bypasses RLS.
create policy "admin can read member_event_attendance" on public.member_event_attendance
  for select using (private.is_admin());

create policy "admin can delete member_event_attendance" on public.member_event_attendance
  for delete using (private.is_admin());

grant insert on table public.member_event_attendance to service_role;
grant select, delete on table public.member_event_attendance to authenticated;
