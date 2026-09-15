-- Time-bucketed membership / confirmed event sign-up counts for the Dashboard
-- trend chart. Every bucket in the window is returned (zero-filled via
-- generate_series) so the chart has no gaps. Buckets are in Europe/London
-- time so "a day" matches what the committee sees locally.
--
-- security invoker: RLS on membership_signups / event_signups applies as the
-- caller, so non-admins get all-zero rows rather than real data.
create or replace function public.dashboard_signup_trend(p_days integer default 30, p_bucket text default 'day')
returns table (bucket date, member_signups integer, event_signups integer)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      greatest(7, least(coalesce(p_days, 30), 365)) as days,
      case when p_bucket = 'week' then 'week' else 'day' end as unit
  ),
  bounds as (
    select
      unit,
      date_trunc(unit, (now() at time zone 'Europe/London') - make_interval(days => days - 1)) as start_bucket,
      date_trunc(unit, now() at time zone 'Europe/London') as end_bucket
    from params
  ),
  series as (
    select gs::date as bucket
    from bounds, generate_series(bounds.start_bucket, bounds.end_bucket, ('1 ' || bounds.unit)::interval) as gs
  ),
  members as (
    select date_trunc(b.unit, s.created_at at time zone 'Europe/London')::date as bucket, count(*)::integer as n
    from public.membership_signups s, bounds b
    where (s.created_at at time zone 'Europe/London') >= b.start_bucket
    group by 1
  ),
  events as (
    select date_trunc(b.unit, s.created_at at time zone 'Europe/London')::date as bucket, count(*)::integer as n
    from public.event_signups s, bounds b
    where s.status = 'confirmed'
      and (s.created_at at time zone 'Europe/London') >= b.start_bucket
    group by 1
  )
  select series.bucket, coalesce(members.n, 0), coalesce(events.n, 0)
  from series
  left join members on members.bucket = series.bucket
  left join events on events.bucket = series.bucket
  order by series.bucket;
$$;

revoke all on function public.dashboard_signup_trend(integer, text) from public, anon;
grant execute on function public.dashboard_signup_trend(integer, text) to authenticated;
