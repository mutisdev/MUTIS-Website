-- Reason: sponsors are no longer grouped by tier; "current" or "past" is now the is_past column.
--
-- is_past was filled from tier = 'past' before this, and display order was
-- renumbered, so nothing is lost.
alter table public.sponsors drop column tier;
