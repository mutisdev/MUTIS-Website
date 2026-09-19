-- Reason: diversity answers are now kept only as anonymous totals (diversity_answer_counts), so the old per-member answers are deleted.
--
-- Every answer in this table was counted into diversity_answer_counts first,
-- and nothing links the two tables, so the totals are unaffected. After this,
-- no diversity answer is stored against any member. membership_signups itself
-- is not touched.
drop table public.membership_signup_diversity;
