import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { hasWebhookSecret } from "../_shared/sendEmail.ts";
import { CV_BUCKET, CV_RETENTION_DAYS } from "../_shared/eventApplications.ts";

// Deletes applicants' CVs once the thing they applied to is long past. Called
// daily by pg_cron (see the schedule migration), authorised by the
// x-webhook-secret header against the Vault secret, exactly like
// send-event-reminders.
//
// The cut-off comes from CV_RETENTION_DAYS, which lives only in
// _shared/eventApplications.ts — the cron schedule says how often to look, never
// how old is too old, so the two can't drift apart.
//
// WHERE the clock starts from is the other half, and it differs by target, so
// it lives in public.application_cv_retention: an event anchors on its
// starts_at, a position on its closes_at, and a position with no closing date
// on the application's own submitted_at, so an open-ended listing still can't
// hold a CV forever. This function reads that view rather than joining to
// events itself — the old `events!inner(starts_at)` embed was an INNER join, so
// the moment event_id became nullable every position application would have
// silently dropped out of this sweep and kept its CV indefinitely.
//
// Only the file goes. The application row, its answers, its reference code and
// the CV's file name all stay as the permanent record; cv_path is nulled, which
// is how the admin page knows to say the CV was deleted rather than offering a
// link to nothing. Safe to re-run: rows with cv_path already null are skipped.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** PostgREST caps responses at max_rows = 1000, and Storage's remove() is
 * happier with modest batches, so the sweep works in chunks. */
const BATCH_SIZE = 100;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (!(await hasWebhookSecret(req, admin))) return json({ error: "Unauthorised" }, 401);

  const cutoff = new Date(Date.now() - CV_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  let removed = 0;
  let failed = 0;

  // Re-queries each pass rather than paginating: every pass clears the cv_path
  // of the rows it handled, so those rows drop out of the filter and the next
  // page is always fresh. A row that fails keeps its cv_path, so `attempts`
  // bounds the loop instead of it spinning on the same failure.
  for (let attempt = 0; attempt < 50; attempt++) {
    // The view already excludes rows with a null cv_path, so a row whose
    // cv_path this sweep clears drops straight out of it — exactly as it
    // dropped out of the old filter.
    const { data: rows, error } = await admin
      .from("application_cv_retention")
      .select("id, cv_path")
      .lt("retention_anchor", cutoff)
      .limit(BATCH_SIZE);

    if (error) {
      console.error("Failed to list CVs due for deletion", error);
      return json({ error: "Database error", removed, failed }, 500);
    }
    if (!rows || rows.length === 0) break;

    const paths = rows.map((row) => row.cv_path).filter((path): path is string => typeof path === "string");
    const { error: removeError } = await admin.storage.from(CV_BUCKET).remove(paths);
    if (removeError) {
      // Storage refused the whole batch; stop rather than null cv_path for
      // files that are still there.
      console.error("Failed to remove CV objects", removeError);
      return json({ error: "Storage error", removed, failed: failed + paths.length }, 502);
    }

    const { error: updateError } = await admin
      .from("event_applications")
      .update({ cv_path: null })
      .in(
        "id",
        rows.map((row) => row.id),
      );
    if (updateError) {
      // The files are already gone, so the rows now point at nothing. Loud,
      // because a retry will find the same rows and its remove() will no-op.
      console.error("CVs deleted but cv_path not cleared", updateError);
      return json({ error: "Database error after deletion", removed, failed: failed + rows.length }, 500);
    }

    removed += paths.length;
    if (rows.length < BATCH_SIZE) break;
  }

  return json({ retention_days: CV_RETENTION_DAYS, cutoff, removed, failed });
});
