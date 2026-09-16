-- Public forms now submit through the `submit-form` Edge Function, which
-- verifies a reCAPTCHA token and inserts with the service role. Remove the
-- direct anon/authenticated INSERT path so the captcha can't be bypassed by
-- POSTing straight to PostgREST or Storage. Admin read/update/delete policies
-- are unchanged; the service role bypasses RLS.
--
-- Deploy AFTER the submit-form function and the frontend that calls it,
-- otherwise the live forms will fail in between.

drop policy "public can submit contact_submissions" on public.contact_submissions;
drop policy "public can submit sponsorship_enquiries" on public.sponsorship_enquiries;
drop policy "public can submit event_signups" on public.event_signups;
drop policy "public can submit attendance_submissions" on public.attendance_submissions;
drop policy "public can submit membership_signups" on public.membership_signups;
drop policy "public can submit membership_signup_diversity" on public.membership_signup_diversity;
drop policy "public can submit alumni_submissions" on public.alumni_submissions;

revoke insert on table
  public.contact_submissions,
  public.sponsorship_enquiries,
  public.event_signups,
  public.attendance_submissions,
  public.membership_signups,
  public.membership_signup_diversity,
  public.alumni_submissions
from anon, authenticated;

drop policy "public can upload alumni_submission_photos" on storage.objects;
