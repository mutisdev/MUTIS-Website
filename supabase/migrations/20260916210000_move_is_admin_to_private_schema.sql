-- Security advisor fixes:
--
-- 1. is_admin() was SECURITY DEFINER in `public`, so anyone could call it via
--    /rest/v1/rpc/is_admin, and it had no fixed search_path. It can't simply
--    have EXECUTE revoked from anon: ~80 RLS policies (applying to all roles)
--    call it, and a policy fails with "permission denied for function" if the
--    querying role can't execute it. Instead move it to a `private` schema that
--    PostgREST doesn't expose. Policies reference the function by OID, so they
--    keep working unchanged.
--
--    NOTE: new migrations must call private.is_admin(), not public.is_admin().
--
-- 2. rls_auto_enable() is an event-trigger function; nobody needs to call it
--    directly (EXECUTE isn't checked when the event trigger fires).

create schema if not exists private;
grant usage on schema private to anon, authenticated, service_role;

alter function public.is_admin() set schema private;
alter function private.is_admin() set search_path = '';
revoke execute on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated, service_role;

revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
