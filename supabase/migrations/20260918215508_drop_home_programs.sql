-- Reason: the homepage "What We Do" programmes section and its admin page have been removed, so its table is no longer used.
--
-- Its 4 rows were only ever shown in that removed section. Past edits remain
-- in the audit log, which is not touched.
drop table public.home_programs;
