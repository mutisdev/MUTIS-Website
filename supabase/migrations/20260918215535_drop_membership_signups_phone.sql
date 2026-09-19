-- Reason: the membership form never asked for a phone number, so this column was empty on every row.
--
-- Only the column is removed; no membership sign-up is deleted.
alter table public.membership_signups drop column phone;
