-- Reason: event feedback is anonymous, so it no longer keeps a name, email, course or year.
--
-- All four columns were empty when this ran. The 1-5 rating rule was added
-- as NOT VALID while an old 1-10 row existed; that row is gone, so the rule
-- is now checked for every row.
alter table public.attendance_submissions
  drop column name,
  drop column email,
  drop column course,
  drop column year;

alter table public.attendance_submissions validate constraint attendance_submissions_rating_check;
