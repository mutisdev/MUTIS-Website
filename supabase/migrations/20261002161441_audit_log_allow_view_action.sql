-- Reason: opening an applicant's CV is a read, not a write, but it still has to be on the record — so the audit log needs a fourth action.
--
-- A CV is personal data an applicant handed over for one purpose, so "which
-- admin looked at it, and when" is exactly the kind of thing the audit log
-- exists for. 'view' doesn't fit insert/update/delete, and encoding it as an
-- 'update' would both misreport a read and pollute the existing update filter
-- on the Audit log page.
--
-- Entries use before = null and after = { cv_path, event_id }. The signed URL is
-- never recorded: it's a working credential, short-lived but still a key.
--
-- The table keeps having no UPDATE or DELETE policy, so it stays immutable.

alter table public.audit_log drop constraint audit_log_action_check;

alter table public.audit_log add constraint audit_log_action_check
  check (action in ('insert', 'update', 'delete', 'view'));
