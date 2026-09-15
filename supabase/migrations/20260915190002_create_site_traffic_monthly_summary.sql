-- One row per month for the Dashboard's all-time chart. Page views are summed
-- from daily snapshots (exact); unique_visitors comes from site_traffic_monthly
-- and is null for months whose start had already left Vercel's retention
-- window when snapshots began (daily visitors can't be summed into uniques).
create view public.site_traffic_monthly_summary
with (security_invoker = on) as
select
  date_trunc('month', d.day)::date as month,
  sum(d.pageviews)::bigint as pageviews,
  m.visitors as unique_visitors,
  count(*)::integer as days_recorded
from public.site_traffic_daily d
left join public.site_traffic_monthly m on m.month = date_trunc('month', d.day)::date
group by 1, m.visitors;

grant select on public.site_traffic_monthly_summary to authenticated;
