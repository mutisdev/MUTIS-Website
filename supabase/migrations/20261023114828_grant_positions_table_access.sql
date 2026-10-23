-- Reason: RLS decides which rows a role sees, but PostgREST checks table privileges first, so the policies on public.positions do nothing until these grants exist.

grant select on table public.positions to anon, authenticated;
grant insert, update, delete on table public.positions to authenticated;

-- service_role bypasses RLS but PostgREST still checks table privileges — see
-- 20260917150000_grant_service_role_form_inserts.sql. submit-application reads
-- the listing to decide whether applications are open.
grant select on table public.positions to service_role;

-- The anon grant above is load-bearing for more than the public page: the
-- event_questions policy added in 20261023114848 reads public.positions in its
-- USING clause, and an RLS policy expression is NOT security-definer — it runs
-- with the querying role's own privileges. Without `select` for anon, that
-- policy fails outright with "permission denied for table positions" instead
-- of simply returning no rows.
