-- Reason: let the feedback form record a member's attendance without erroring when they submit twice.
--
-- The submit-form Edge Function inserts with ON CONFLICT (event_id, email)
-- DO NOTHING, and Postgres needs SELECT on the table to check the conflict
-- target. Without this, every "Yes, I'm a member" submission fails with
-- 42501 permission denied.
grant select on table public.member_event_attendance to service_role;
