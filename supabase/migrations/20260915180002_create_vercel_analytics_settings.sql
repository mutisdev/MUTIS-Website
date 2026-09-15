-- Singleton config for the Vercel Web Analytics integration (Dashboard site
-- traffic). project_id / team_id aren't secrets and live here; the access
-- token itself is stored in Supabase Vault as `vercel_analytics_token` via the
-- existing service_role-only etoro_set_secret / etoro_get_secret wrappers and
-- is only ever read by the vercel-analytics Edge Functions.
create table public.vercel_analytics_settings (
  id            boolean primary key default true,
  project_id    text,
  team_id       text,
  is_configured boolean not null default false,
  updated_at    timestamptz not null default now(),
  updated_by    uuid references public.admin_users(user_id),
  constraint vercel_analytics_settings_singleton check (id)
);

insert into public.vercel_analytics_settings (id, project_id, team_id)
values (true, 'prj_ZmG6jkUo7D0EHPiytzFlRnIIyIre', 'team_FGCiySUEEkmGutsoCwDrloPP');

alter table public.vercel_analytics_settings enable row level security;

create policy "admin read vercel analytics settings" on public.vercel_analytics_settings
  for select using (public.is_admin());

create policy "admin write vercel analytics settings" on public.vercel_analytics_settings
  for all using (public.is_admin()) with check (public.is_admin());

grant select on table public.vercel_analytics_settings to authenticated;
