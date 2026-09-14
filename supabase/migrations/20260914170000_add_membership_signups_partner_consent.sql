-- Records consent to share the applicant's data (including the diversity
-- answers) with partner firms, given via the same checkbox as the Privacy
-- Policy agreement. Tracked with its own timestamp, same pattern as
-- alumni_submissions' consent_gdpr/consent_publish/consent_at.
alter table public.membership_signups
  add column consent_share_partners boolean not null default false,
  add column consent_share_partners_at timestamptz;
