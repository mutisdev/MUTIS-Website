-- Reason: count the events each member signed up for and attended, and how many event sign-ups came from non-members.
--
-- All three views use security_invoker, so RLS applies as the caller: admins
-- see real numbers, anyone else sees nothing. Everything is matched on the
-- normalised email at query time, so someone who becomes a member after
-- signing up for events is credited for those earlier sign-ups.

-- Per member: distinct events signed up for (confirmed only) and distinct
-- events attended. Scalar subqueries rather than joins, so duplicate rows on
-- either side can never double count.
create view public.member_event_counts
with (security_invoker = on) as
select
  m.id as member_id,
  (
    select count(distinct s.event_id)
    from public.event_signups s
    where s.email = m.email and s.status = 'confirmed'
  )::integer as events_signed_up,
  (
    select count(distinct a.event_id)
    from public.member_event_attendance a
    where a.email = m.email
  )::integer as events_attended
from public.membership_signups m;

grant select on public.member_event_counts to authenticated;

-- Same columns as before, plus non_member_event_signups at the end.
create or replace view public.dashboard_signup_summary
with (security_invoker = on) as
select
  (select count(*) from public.membership_signups) as total_members,
  (select count(*) from public.membership_signups where created_at >= now() - interval '7 days') as members_7d,
  (select count(*) from public.event_signups where status = 'confirmed') as total_event_signups,
  (select count(*) from public.event_signups
     where status = 'confirmed' and created_at >= now() - interval '7 days') as event_signups_7d,
  (select count(*) from public.event_signups s
     where s.status = 'confirmed'
       and not exists (select 1 from public.membership_signups m where m.email = s.email)) as non_member_event_signups;

-- Same columns as before (attendance_count = anonymous feedback responses),
-- plus member_attendance_count at the end.
create or replace view public.event_attendance_stats
with (security_invoker = on) as
select
  e.id as event_id,
  e.title,
  e.starts_at,
  e.capacity,
  coalesce(s.signup_count, 0) as signup_count,
  coalesce(a.attendance_count, 0) as attendance_count,
  coalesce(ma.member_attendance_count, 0) as member_attendance_count
from public.events e
left join (
  select event_id, count(*) as signup_count
  from public.event_signups
  where status = 'confirmed'
  group by event_id
) s on s.event_id = e.id
left join (
  select event_id, count(*) as attendance_count
  from public.attendance_submissions
  where event_id is not null
  group by event_id
) a on a.event_id = e.id
left join (
  select event_id, count(*) as member_attendance_count
  from public.member_event_attendance
  group by event_id
) ma on ma.event_id = e.id;
