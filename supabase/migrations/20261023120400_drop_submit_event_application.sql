-- Reason: submit_application supersedes it, and leaving a second grantable write path into event_applications behind is attack surface for no benefit.
--
-- APPLY THIS LAST — after the submit-application Edge Function that calls
-- submit_application is deployed. Applying it any earlier breaks live
-- submissions for the length of the deploy. Same ordering rule as
-- 20261002164635_schedule_purge_event_cvs.sql.
--
-- The Edge Function is its only caller: EXECUTE was never granted to anon or
-- authenticated (see 20261002162955_submit_event_application.sql), so nothing
-- in the browser can be relying on it.

drop function public.submit_event_application(uuid, uuid, text, text, text, text, integer, jsonb);
