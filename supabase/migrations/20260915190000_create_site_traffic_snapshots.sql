-- Long-term copy of Vercel Web Analytics. Vercel Hobby only guarantees a
-- 1-month reporting window, so the vercel-analytics-snapshot Edge Function
-- copies each day into Supabase before it expires. Days are UTC (Vercel's
-- own bucketing).

-- One row per day: that day's page views and unique visitors.
create table public.site_traffic_daily (
  day        date primary key,
  pageviews  integer not null default 0,
  visitors   integer not null default 0,
  fetched_at timestamptz not null default now()
);

-- Per-day breakdowns. `value` is the raw dimension value (request path,
-- referrer hostname, device type, ISO country code); page titles are
-- resolved at read time so renamed events show their current title.
create table public.site_traffic_daily_breakdown (
  day        date not null,
  dimension  text not null check (dimension in ('page', 'referrer', 'device', 'country')),
  value      text not null,
  pageviews  integer not null default 0,
  visitors   integer not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (day, dimension, value)
);

-- Calendar-month totals. Stored separately because unique visitors can't be
-- summed across days (a returning visitor would be counted once per day);
-- these are Vercel's true month-level uniques, refreshed daily while the
-- month is still inside Vercel's reporting window.
create table public.site_traffic_monthly (
  month      date primary key check (extract(day from month) = 1),
  pageviews  integer not null default 0,
  visitors   integer not null default 0,
  fetched_at timestamptz not null default now()
);

alter table public.site_traffic_daily enable row level security;
alter table public.site_traffic_daily_breakdown enable row level security;
alter table public.site_traffic_monthly enable row level security;

create policy "admin read site traffic daily" on public.site_traffic_daily
  for select using (public.is_admin());
create policy "admin read site traffic breakdown" on public.site_traffic_daily_breakdown
  for select using (public.is_admin());
create policy "admin read site traffic monthly" on public.site_traffic_monthly
  for select using (public.is_admin());

grant select on table public.site_traffic_daily, public.site_traffic_daily_breakdown, public.site_traffic_monthly
  to authenticated;
-- The snapshot Edge Function writes with the service_role key.
grant select, insert, update on table public.site_traffic_daily, public.site_traffic_daily_breakdown, public.site_traffic_monthly
  to service_role;

-- Lifetime totals for the Dashboard, computed in Postgres (no paginated
-- client-side summing). lifetime_visitors is intentionally absent — see the
-- note on site_traffic_monthly.
create view public.site_traffic_totals
with (security_invoker = on) as
select
  coalesce(sum(pageviews), 0)::bigint as lifetime_pageviews,
  -- First day with real traffic, not the first (zero) day a backfill touched.
  min(day) filter (where pageviews > 0) as tracked_since,
  max(day) as last_day,
  count(*)::integer as days_recorded
from public.site_traffic_daily;

grant select on public.site_traffic_totals to authenticated;

-- All-time top values for one breakdown dimension (e.g. lifetime top pages).
create or replace function public.site_traffic_top(p_dimension text, p_limit integer default 10)
returns table (value text, pageviews bigint, visitors bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.value, sum(b.pageviews)::bigint, sum(b.visitors)::bigint
  from public.site_traffic_daily_breakdown b
  where b.dimension = p_dimension
    and b.value <> 'Others'
  group by b.value
  order by 2 desc
  limit greatest(1, least(coalesce(p_limit, 10), 100));
$$;

revoke all on function public.site_traffic_top(text, integer) from public, anon;
grant execute on function public.site_traffic_top(text, integer) to authenticated;
