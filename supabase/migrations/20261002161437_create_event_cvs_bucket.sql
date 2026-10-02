-- Reason: hold applicants' CVs somewhere only admins can read, since a CV is personal data that was never meant to be public.
--
-- This is the project's FIRST private bucket — every other one (event_photos,
-- article_pdfs, …) is public and read straight off its public URL. CVs can't
-- work that way, so the two new rules here are: no public URL ever exists, and
-- admins fetch a file through a short-lived signed URL
-- (CV_SIGNED_URL_SECONDS in supabase/functions/_shared/eventApplications.ts).
--
-- Objects live at <event_id>/<application_id>.pdf, a shape the
-- event_applications.cv_path CHECK constraint also enforces.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-cvs', 'event-cvs', false, 5242880, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf'];

-- SELECT only, admins only. This is what lets the admin panel mint a signed URL
-- under its own session. There is deliberately no insert/update/delete policy
-- for anyone: uploads happen inside submit-application and deletions inside
-- purge-event-cvs, both with the service role, which bypasses RLS.
--
-- The bucket's allowed_mime_types trusts whatever content type the uploader
-- declares, so it is a backstop only — the real gate is the magic-byte check in
-- eventApplications.ts, run on the received bytes before anything is stored.
create policy "admin read event-cvs" on storage.objects
  for select
  using (bucket_id = 'event-cvs' and private.is_admin());
