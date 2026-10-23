-- Reason: let an admin choose which part of a page-background photo shows in the banner,
-- instead of the framing being decided by one hard-coded CSS rule (top-anchored cover).
--
-- Purely additive and non-destructive. The uploaded file is never altered: the stored
-- rectangle is applied at render time, so a crop can be changed or cleared later without
-- re-uploading the photo. A row with crop null renders exactly as it does today.
--
-- Shape: {"x":0.12,"y":0.30,"w":0.76,"h":0.42}
--   x,y  top-left corner of the selection, as a fraction of the full image
--   w,h  its width and height, likewise
-- All four are 0..1 and x+w, y+h are <= 1. jsonb rather than four real columns so that it
-- is one atomic write next to image_url and "no crop" is a single null, not four.
--
-- The app treats a malformed value as no crop (see parseCrop in app/lib/heroCrop.ts), so
-- the check constraint below is a guard against bad writes, not the only line of defence.
--
-- NOTE: this constraint has a NULL hole — see the follow-up migration
-- 20261020194054_page_background_crop_constraint_null_fix.sql, which replaces it.
--
-- No grant or policy work: "grant update on table public.page_backgrounds to authenticated"
-- and the "admin write page_backgrounds" policy are both table-level and already cover a
-- new column.

alter table public.page_backgrounds add column crop jsonb;

alter table public.page_backgrounds add constraint page_backgrounds_crop_valid check (
  crop is null or (
    jsonb_typeof(crop) = 'object'
    and jsonb_typeof(crop -> 'x') = 'number'
    and jsonb_typeof(crop -> 'y') = 'number'
    and jsonb_typeof(crop -> 'w') = 'number'
    and jsonb_typeof(crop -> 'h') = 'number'
    and (crop ->> 'w')::numeric > 0
    and (crop ->> 'h')::numeric > 0
    and (crop ->> 'x')::numeric >= 0
    and (crop ->> 'y')::numeric >= 0
    and (crop ->> 'x')::numeric + (crop ->> 'w')::numeric <= 1.0001
    and (crop ->> 'y')::numeric + (crop ->> 'h')::numeric <= 1.0001
  )
);

comment on column public.page_backgrounds.crop is
  'Optional {x,y,w,h} selection (fractions of the full image) describing which part of the photo the page banner frames. Null means the whole image, top-anchored.';
