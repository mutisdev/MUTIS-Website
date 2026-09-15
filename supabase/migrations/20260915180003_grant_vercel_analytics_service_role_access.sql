-- The vercel-analytics Edge Functions use the service_role key over
-- PostgREST. New tables here aren't auto-granted to API roles, so without
-- these the settings update fails (500) and page-title lookups return nothing.
grant select, update on table public.vercel_analytics_settings to service_role;
grant select on table public.events to service_role;
grant select on table public.articles to service_role;
