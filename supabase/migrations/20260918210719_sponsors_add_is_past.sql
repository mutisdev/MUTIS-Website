-- Reason: mark past sponsors with a simple yes/no instead of a gold/silver/past "tier".
--
-- Additive step only: `tier` stays (now nullable, no check) so the currently
-- deployed frontend keeps working until the tier-free code ships. The column
-- itself is dropped in a later, separate migration.

alter table public.sponsors
  add column is_past boolean not null default false;

update public.sponsors set is_past = (tier = 'past');

-- display_order used to restart at 0 inside each tier. Renumber into one
-- sequence for current sponsors (former gold before silver, keeping their
-- existing order) and one for past sponsors.
with ordered as (
  select
    id,
    row_number() over (
      partition by is_past
      order by case tier when 'gold' then 0 when 'silver' then 1 else 2 end, display_order, name
    ) - 1 as new_order
  from public.sponsors
)
update public.sponsors s
set display_order = o.new_order
from ordered o
where o.id = s.id;

alter table public.sponsors
  drop constraint sponsors_tier_check,
  drop constraint sponsors_name_tier_key,
  alter column tier drop not null;
