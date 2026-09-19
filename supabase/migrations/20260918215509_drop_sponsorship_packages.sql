-- Reason: sponsorship tiers (Gold / Silver / Bronze packages) have been retired, and their admin page removed.
--
-- The 3 package rows were not shown anywhere on the public site. Past edits
-- remain in the audit log, which is not touched.
drop table public.sponsorship_packages;
