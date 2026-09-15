-- vercel-analytics compares sign-up page traffic with sign-ups actually
-- stored, over the same window, using the service_role key.
grant select on table public.event_signups to service_role;
grant select on table public.membership_signups to service_role;
