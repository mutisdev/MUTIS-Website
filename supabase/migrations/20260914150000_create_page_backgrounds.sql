create table public.page_backgrounds (
  page_key   text primary key,
  image_url  text,
  updated_at timestamptz not null default now()
);

insert into public.page_backgrounds (page_key) values
  ('home'), ('about'), ('previous-presidents'), ('network'), ('events'),
  ('past-speakers'), ('meif'), ('wif'), ('articles'), ('sponsors'),
  ('media'), ('gallery'), ('recordings'), ('contact'), ('team'), ('join');

alter table public.page_backgrounds enable row level security;

create policy "public read page_backgrounds" on public.page_backgrounds
  for select using (true);

create policy "admin write page_backgrounds" on public.page_backgrounds
  for update using (public.is_admin()) with check (public.is_admin());
