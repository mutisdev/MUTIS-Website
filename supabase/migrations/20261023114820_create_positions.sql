-- Reason: MUTIS runs schemes and committee positions people apply to, and they need a listing of their own rather than being faked as events with a date nobody means and a venue nobody reads.
--
-- Deliberately NOT an event. An event has a time and a place and people turn
-- up to it; a position is open for a while and then it isn't. Modelling one as
-- the other would drag along starts_at, capacity, calendar invites and
-- reminder emails, none of which a position has any use for.
--
-- The column set is as small as it can be. There is no signup_enabled, because
-- there is no one-click mode for a position, and no requires_application,
-- because applications are the only mode a position has — "is there a form" is
-- already decided by whether the listing has any questions, which
-- submit_application treats as closed when it has none.
--
-- "Applications are open" is exactly:
--   is_published and applications_open and (closes_at is null or closes_at > now())
-- and that predicate is written identically in the event_questions RLS policy,
-- in submit_application and in the submit-application Edge Function.
--
-- No images: a scheme listing is text, and every image column in this project
-- arrives with a bucket, a crop UI and an orphaned-object problem behind it.
--
-- NOTE: private.is_admin(), not public.is_admin() — see
-- 20260916210000_move_is_admin_to_private_schema.sql.

create table public.positions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (btrim(title) <> '' and length(title) <= 200),
  -- Sanitised HTML from the admin rich-text editor, exactly like
  -- events.description: sanitising happens in the browser on render
  -- (DOMPurify) and in emailSafeHtml() on send, never here.
  description   text not null,
  -- The label the public page groups listings under ("Committee", "Fund
  -- Management Scheme"). Free text rather than a CHECK list, the same choice
  -- gallery_images.category makes, because the set changes every year and an
  -- enumerated list would need a migration each time it did.
  category      text not null check (btrim(category) <> '' and length(category) <= 80),
  -- OPTIONAL deadline. NULL means open until closed by hand.
  closes_at     timestamptz,
  -- The counterpart of events.signup_enabled: stop taking applications while
  -- leaving the listing up. Without it the only ways to pause a round would be
  -- to unpublish (which hides the description too) or to backdate closes_at
  -- (which lies about why it closed).
  applications_open boolean not null default true,
  -- Defaults false, unlike events: a listing is written, its questions are
  -- added, and only then does it go live. With no requires_application toggle
  -- to hide behind, published means live.
  is_published  boolean not null default false,
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Drives the public Opportunities page's single query.
create index positions_published_order_idx
  on public.positions (display_order, created_at)
  where is_published;

alter table public.positions enable row level security;

create policy "public read published positions" on public.positions
  for select using (is_published = true);

create policy "admin read all positions" on public.positions
  for select using (private.is_admin());

create policy "admin write positions" on public.positions
  for all using (private.is_admin()) with check (private.is_admin());
