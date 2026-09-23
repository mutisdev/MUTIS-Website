-- Reason: the podcast section now shows several episodes in a fixed order, so
-- episodes get their own table with a display_order slot instead of the
-- single-row podcast_settings embed the admin page could only overwrite.
--
-- podcast_settings is deliberately left in place (the app stops reading it after
-- this migration) so the previous embed can be recovered if anything looks wrong.
-- It can be dropped in a later migration once this is verified in production.

create table public.podcast_episodes (
  id            uuid primary key default gen_random_uuid(),
  spotify_url   text not null,
  embed_html    text,
  embed_width   integer,
  embed_height  integer,
  embed_title   text,
  thumbnail_url text,
  fetched_at    timestamptz,
  display_order integer not null default 0,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Both the public page and the admin list read this table ordered by slot.
create index podcast_episodes_display_order_idx on public.podcast_episodes (display_order);

-- Carry the existing embed over as the first slot. The seeded podcast_settings
-- row has an empty spotify_url until an admin saves a link, so skip that case.
insert into public.podcast_episodes (
  spotify_url, embed_html, embed_width, embed_height, embed_title,
  thumbnail_url, fetched_at, display_order, is_published
)
select spotify_url, embed_html, embed_width, embed_height, embed_title,
       thumbnail_url, fetched_at, 0, true
from public.podcast_settings
where coalesce(spotify_url, '') <> ''
order by updated_at desc
limit 1;

alter table public.podcast_episodes enable row level security;

create policy "public read published podcast_episodes" on public.podcast_episodes
  for select using (is_published = true);

create policy "admin read all podcast_episodes" on public.podcast_episodes
  for select using (private.is_admin());

create policy "admin write podcast_episodes" on public.podcast_episodes
  for all using (private.is_admin()) with check (private.is_admin());

grant select on table public.podcast_episodes to anon, authenticated;
grant insert, update, delete on table public.podcast_episodes to authenticated;
