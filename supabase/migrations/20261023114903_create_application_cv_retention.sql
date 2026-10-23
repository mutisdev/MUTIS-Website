-- Reason: purge-event-cvs worked out how old a CV was by joining to events.starts_at, and a position has no start date — so the retention clock has to branch in SQL rather than inside the sweep.
--
-- What this view deliberately does NOT contain is how long a CV is kept. That
-- number lives once, as CV_RETENTION_DAYS in
-- supabase/functions/_shared/eventApplications.ts, and
-- 20261002164635_schedule_purge_event_cvs.sql already refuses to carry a copy
-- of it for exactly this reason. So this view exposes only the instant the
-- clock starts from, and the sweep still works out its own cut-off. Putting an
-- interval in here would put the number in two places.
--
-- Anchors:
--   event    — events.starts_at, which is NOT NULL, so coalesce always takes
--              it and every existing row gets precisely the anchor the old
--              events!inner join gave it.
--   position — positions.closes_at where there is one; a listing with no
--              deadline falls back to the application's own submitted_at, so
--              an open-ended listing still can't hold a CV forever.
--
-- security_invoker: the view runs as its caller. Its only caller is
-- purge-event-cvs with the service role, which is BYPASSRLS and so still sees
-- every row; without this the view would run as its owner and the security
-- advisor would rightly flag it as a security-definer view.
create view public.application_cv_retention
with (security_invoker = on) as
select a.id,
       a.cv_path,
       coalesce(e.starts_at, p.closes_at, a.submitted_at) as retention_anchor
  from public.event_applications a
  left join public.events    e on e.id = a.event_id
  left join public.positions p on p.id = a.position_id
 where a.cv_path is not null;

-- Read-only, and only for the sweep. Admins have no use for it — the
-- Applications page reads event_applications directly — so it isn't granted to
-- authenticated, and anon gets nothing at all. The sweep still nulls cv_path on
-- the base table, where service_role already holds `update (cv_path)`; nothing
-- is ever written through this view.
grant select on table public.application_cv_retention to service_role;
