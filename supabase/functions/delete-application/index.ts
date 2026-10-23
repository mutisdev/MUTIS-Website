import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { CV_BUCKET } from "../_shared/eventApplications.ts";

// Deletes one application: its CV, its answers and its row.
//
// This can't be done from the admin page directly, even though an admin DOES
// hold DELETE on event_applications. The CV lives in the private event-cvs
// bucket, whose only policy is "admin read event-cvs" — SELECT and nothing
// else — so no session can remove the object. Deleting just the row would
// orphan the PDF permanently: purge-event-cvs finds expired CVs through the
// application row, so a file whose row is gone is a file the retention sweep
// can never see again. An admin clicking delete must not quietly leave
// someone's CV in a bucket forever, which is why the whole operation runs here
// with the service role.
//
// Order is deliberate: the object goes first, then the row. If the row delete
// then fails we null cv_path — exactly what purge-event-cvs does — so the state
// stays consistent (row kept, CV shown as deleted) and the admin can retry.
// Deleting the row first would risk the opposite: a successful row delete
// followed by a failed object delete, leaving an invisible, unreachable,
// never-purged file.
//
// verify_jwt stays on, and the caller is additionally checked against
// admin_users before anything is touched, the same belt-and-braces as
// create-invite.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

Deno.serve(async (req: Request) => {
  // supabase-js sends an Authorization header on every call, which makes the
  // browser preflight with OPTIONS first — without a 2xx response to that, the
  // POST never goes out and invoke() fails with a network error.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
  if (callerError || !callerData.user) return json({ error: "Invalid session" }, 401);
  const caller = callerData.user;

  const { data: callerAdminRow } = await admin
    .from("admin_users")
    .select("user_id, email")
    .eq("user_id", caller.id)
    .maybeSingle();
  if (!callerAdminRow) return json({ error: "Only admins can delete applications." }, 403);

  let body: { application_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const applicationId = String(body.application_id ?? "");
  if (!applicationId) return json({ error: "Missing field: application_id" }, 400);

  // The whole row plus its answers, read before anything is removed: this is
  // the audit log's `before` snapshot, and it is the only record that will
  // survive the delete.
  const { data: application, error: loadError } = await admin
    .from("event_applications")
    .select("*, application_answers(*)")
    .eq("id", applicationId)
    .maybeSingle();
  if (loadError) {
    console.error("Failed to load application for deletion", applicationId, loadError);
    return json({ error: "Database error", detail: loadError.code ?? "none" }, 500);
  }
  // Already gone. Treated as success so a double-click, or a retry after a
  // dropped response, doesn't show the admin an error for work that is done.
  if (!application) return json({ ok: true, already_deleted: true }, 200);

  // ---- 1. the CV object ----
  if (application.cv_path) {
    const { error: removeError } = await admin.storage.from(CV_BUCKET).remove([application.cv_path]);
    if (removeError) {
      // Stop here. The row still points at the file, so nothing is orphaned and
      // the admin can try again.
      console.error("Failed to remove CV, application NOT deleted", application.cv_path, removeError);
      return json({ error: "Could not delete the CV, so nothing was deleted. Please try again." }, 502);
    }
  }

  // ---- 2. the row, cascading to application_answers ----
  const { error: deleteError } = await admin
    .from("event_applications")
    .delete()
    .eq("id", applicationId);

  if (deleteError) {
    console.error("CV deleted but application row not deleted", applicationId, deleteError);
    // The file is already gone, so leaving cv_path pointing at it would show the
    // admin a link to nothing. Nulling it is the same end state purge-event-cvs
    // produces, and the admin page already renders that as "CV deleted".
    const { error: clearError } = await admin
      .from("event_applications")
      .update({ cv_path: null })
      .eq("id", applicationId);
    if (clearError) {
      console.error("ORPHANED REFERENCE: cv_path still points at a deleted object", applicationId, clearError);
    }
    return json({ error: "The CV was deleted but the application could not be. Please try again." }, 500);
  }

  // ---- 3. audit ----
  // After the fact and best-effort, like every other audit write in this
  // project: a logging failure must not undo a deletion that has already
  // happened. Logged loudly, because this is the one action whose `before`
  // snapshot is the only copy left.
  const { error: auditError } = await admin.from("audit_log").insert({
    actor_user_id: caller.id,
    actor_email: caller.email ?? callerAdminRow.email ?? "unknown",
    table_name: "event_applications",
    row_id: applicationId,
    action: "delete",
    before: application as never,
    after: null,
  });
  if (auditError) {
    console.error(`AUDIT MISSING for deleted application ${applicationId}`, auditError);
  }

  return json({ ok: true, audited: !auditError }, 200);
});
