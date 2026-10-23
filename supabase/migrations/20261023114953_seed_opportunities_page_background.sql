-- Reason: give the new Opportunities page a page_backgrounds row so its hero image is editable in the admin panel like every other page's.
--
-- page_backgrounds grants only `update` to authenticated (see
-- 20260914150001_grant_page_backgrounds_table_access.sql) and its keys were
-- seeded by an insert in 20260914150000_create_page_backgrounds.sql. So adding
-- 'opportunities' to the PAGES list in the admin page isn't enough on its own —
-- without this row there is nothing for the admin UI to update.
--
-- Following that original migration's precedent. This is a seed insert, not row
-- cleanup: it adds one row and deletes nothing. on conflict do nothing so the
-- migration is safe to re-run.

insert into public.page_backgrounds (page_key)
values ('opportunities')
on conflict (page_key) do nothing;
