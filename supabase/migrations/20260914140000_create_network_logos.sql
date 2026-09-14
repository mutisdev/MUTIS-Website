create table public.network_logos (
  id            uuid primary key default gen_random_uuid(),
  company_name  text not null,
  logo_url      text not null,
  alumnus_id    uuid references public.alumni(id) on delete set null,
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.network_logos enable row level security;

create policy "public read published network_logos" on public.network_logos
  for select using (is_published = true);

create policy "admin read all network_logos" on public.network_logos
  for select using (public.is_admin());

create policy "admin write network_logos" on public.network_logos
  for all using (public.is_admin()) with check (public.is_admin());
