import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { eventEmailParams, hasWebhookSecret, sendTemplatedEmail } from "../_shared/sendEmail.ts";

// Emails "you're signed up" to a new event_signups row. Called by the
// AFTER INSERT trigger on event_signups (pg_net, after the insert commits),
// so a slow or failing send never affects the signup itself.
//
// Body: { record_id: uuid }. Safe to re-run: the row is claimed by setting
// confirmation_sent_at, so each signup gets at most one confirmation. If the
// send fails the claim is released and a later call can retry.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (!(await hasWebhookSecret(req, admin))) return json({ error: "Unauthorised" }, 401);

  let recordId: string;
  try {
    recordId = String((await req.json())?.record_id ?? "");
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  if (!recordId) return json({ error: "Missing record_id" }, 400);

  const { data: signup, error: claimError } = await admin
    .from("event_signups")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", recordId)
    .eq("status", "confirmed")
    .is("confirmation_sent_at", null)
    .select("id, name, email, event_id")
    .maybeSingle();
  if (claimError) {
    console.error("Failed to claim signup", recordId, claimError);
    return json({ error: "Database error" }, 500);
  }
  // Already confirmed, cancelled, or no such row: nothing to do.
  if (!signup) return json({ sent: false, reason: "not_pending" });

  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, description, location, starts_at, ends_at, requires_application")
    .eq("id", signup.event_id)
    .maybeSingle();

  // The joining block, for events that have one and have it switched on. Read
  // from event_video_details with the service role: no anon policy exists on
  // that table, which is what keeps the link out of the public events API and
  // off every public page.
  //
  // A null here is not a failure — most events are in person — so unlike the
  // event lookup it doesn't stop the confirmation going out. An error is
  // different: sending a confirmation with the joining block silently missing
  // would look complete and be wrong, so release the claim and let a retry
  // handle it.
  let videoDetails: string | null = null;
  if (event) {
    const { data: video, error: videoError } = await admin
      .from("event_video_details")
      .select("body_text, is_enabled")
      .eq("event_id", event.id)
      .maybeSingle();
    if (videoError) {
      console.error("Failed to load video details for signup", signup.id, videoError);
      await admin.from("event_signups").update({ confirmation_sent_at: null }).eq("id", signup.id);
      return json({ sent: false, reason: "video_details_unavailable" }, 502);
    }
    // TODO(application flow): an event with requires_application = true never
    // produces an event_signups row today — the public page swaps the one-click
    // signup for the application form, and an accepted application is not yet
    // turned into a confirmed sign-up. So this branch is unreachable, and is
    // here to make sure it stays safe when that flow is built: a joining link
    // must not go out until the person actually has a place, and acceptance
    // will need its own email carrying the block. Withholding it is the
    // behaviour-preserving choice in the meantime.
    videoDetails = event.requires_application ? null : (video?.is_enabled ? video.body_text : null);
  }

  const sent = !eventError && !!event &&
    (await sendTemplatedEmail({
      to: signup.email,
      subject: `You're signed up: ${event.title}`,
      templateFile: "confirmation.html",
      params: eventEmailParams(event, signup.name, videoDetails),
    }));

  if (!sent) {
    if (eventError || !event) console.error("Failed to load event for signup", signup.id, eventError);
    await admin.from("event_signups").update({ confirmation_sent_at: null }).eq("id", signup.id);
    return json({ sent: false, reason: "send_failed" }, 502);
  }
  return json({ sent: true });
});
