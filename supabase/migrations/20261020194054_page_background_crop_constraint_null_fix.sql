-- Reason: the crop check constraint added in 20261020194005 let one bad shape through — a
-- value missing a key, e.g. {"x":0,"y":0,"w":0.5} with no "h".
--
-- `jsonb_typeof(crop -> 'h')` is SQL NULL when the key is absent, which makes the whole AND
-- chain NULL, and a CHECK constraint accepts NULL (it only rejects FALSE). Wrapping the
-- predicate in `IS TRUE` collapses NULL to false so a malformed value is rejected like any
-- other. Caught by testing each bad shape against the live constraint, not by reading it.
--
-- Nothing depended on the old constraint — the column shipped minutes earlier and no row
-- had a crop set — so this drops and recreates it rather than layering a second one.
-- Pure DDL; no rows are read or written.

alter table public.page_backgrounds drop constraint page_backgrounds_crop_valid;

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
  ) is true
);
