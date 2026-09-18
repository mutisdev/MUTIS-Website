-- Reason: store emails in one consistent form so event sign-ups can be matched to members, and only accept University of Manchester addresses from now on.
--
-- No rows are deleted. Emails are only lowercased and trimmed (none needed it
-- when this was written).
--
-- The domain rule only applies to rows created after the cutover below.
-- A plain NOT VALID constraint would still be checked whenever an older row is
-- updated (e.g. an admin changing its status), which would fail for any
-- existing non-university address. The cutover keeps those rows editable
-- while the constraint itself is fully validated.
--
-- Allowed domains must match UNI_EMAIL_DOMAINS in
-- supabase/functions/_shared/uniEmail.ts.

update public.membership_signups set email = lower(btrim(email)) where email <> lower(btrim(email));
update public.event_signups      set email = lower(btrim(email)) where email <> lower(btrim(email));

alter table public.membership_signups
  add constraint membership_signups_email_normalised check (email = lower(btrim(email))),
  add constraint membership_signups_email_uni_domain check (
    created_at < timestamptz '2026-09-18 21:00:00+00'
    or email ~ '^[^\s@]+@(student\.manchester\.ac\.uk|postgrad\.manchester\.ac\.uk|manchester\.ac\.uk)$'
  );

alter table public.event_signups
  add constraint event_signups_email_normalised check (email = lower(btrim(email))),
  add constraint event_signups_email_uni_domain check (
    created_at < timestamptz '2026-09-18 21:00:00+00'
    or email ~ '^[^\s@]+@(student\.manchester\.ac\.uk|postgrad\.manchester\.ac\.uk|manchester\.ac\.uk)$'
  );

-- Supports matching sign-ups to members by email. membership_signups is
-- already covered by its unique index on lower(email).
create index event_signups_email_idx on public.event_signups (email);
