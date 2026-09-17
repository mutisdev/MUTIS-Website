-- The submit-form Edge Function inserts with the service_role key. service_role
-- bypasses RLS, but Postgres privilege checks are separate from RLS, and this
-- project only grants service_role what each table explicitly needs. Without
-- these grants every public form fails with "permission denied" (42501) now
-- that lock_down_public_form_inserts removed the anon INSERT path.
grant insert on table
  public.contact_submissions,
  public.sponsorship_enquiries,
  public.event_signups,
  public.attendance_submissions,
  public.membership_signups,
  public.membership_signup_diversity,
  public.alumni_submissions
to service_role;
