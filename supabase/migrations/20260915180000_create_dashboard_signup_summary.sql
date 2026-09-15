-- Single-row KPI totals for the analytics Dashboard: all-time and rolling
-- 7-day counts of membership sign-ups and confirmed event sign-ups. Computed
-- in Postgres (not by counting a paginated client fetch) so the numbers match
-- a direct SQL count past PostgREST's default page size.
--
-- security_invoker: RLS applies as the caller, so only admins see real counts.
create view public.dashboard_signup_summary
with (security_invoker = on) as
select
  (select count(*) from public.membership_signups) as total_members,
  (select count(*) from public.membership_signups
    where created_at >= now() - interval '7 days') as members_7d,
  (select count(*) from public.event_signups
    where status = 'confirmed') as total_event_signups,
  (select count(*) from public.event_signups
    where status = 'confirmed' and created_at >= now() - interval '7 days') as event_signups_7d;

grant select on public.dashboard_signup_summary to authenticated;
