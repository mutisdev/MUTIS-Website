import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { eventEmailParams, hasWebhookSecret, sendTemplatedEmail } from "../_shared/sendEmail.ts";

// Sends "your event is tomorrow" to everyone signed up for an event starting
// 23–25 hours from now. Run hourly by pg_cron (the 2-hour window means an
// event is always caught even if one run is late or skipped).
//
// Safe to re-run: each event is claimed by setting reminder_sent_at before
// any email goes out, so overlapping or repeated runs never double-send. The
// trade-off is that a crash part-way through a batch skips the rest rather
// than resending; per-recipient failures are logged and counted.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOUR_MS = 3_600_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (!(await hasWebhookSecret(req, admin))) return json({ error: "Unauthorised" }, 401);

  const now = Date.now();
  const { data: dueEvents, error: eventsError } = await admin
    .from("events")
    .select("id")
    .eq("is_published", true)
    .is("reminder_sent_at", null)
    .gte("starts_at", new Date(now + 23 * HOUR_MS).toISOString())
    .lte("starts_at", new Date(now + 25 * HOUR_MS).toISOString());
  if (eventsError) {
    console.error("Failed to find due events", eventsError);
    return json({ error: "Database error" }, 500);
  }

  let events = 0, sent = 0, failed = 0;

  for (const { id } of dueEvents ?? []) {
    const { data: event, error: claimError } = await admin
      .from("events")
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq("id", id)
      .is("reminder_sent_at", null)
      .select("id, title, description, location, starts_at, ends_at")
      .maybeSingle();
    if (claimError) {
      console.error("Failed to claim event", id, claimError);
      continue;
    }
    if (!event) continue; // another run got there first
    events++;

    const { data: signups, error: signupsError } = await admin
      .from("event_signups")
      .select("name, email")
      .eq("event_id", event.id)
      .eq("status", "confirmed");
    if (signupsError) {
      console.error("Failed to load signups for event", event.id, signupsError);
      continue;
    }

    for (const signup of signups ?? []) {
      const ok = await sendTemplatedEmail({
        to: signup.email,
        subject: `Reminder: ${event.title} is tomorrow`,
        templateFile: "reminder.html",
        params: eventEmailParams(event, signup.name),
      });
      if (ok) sent++;
      else {
        failed++;
        console.error("Reminder not sent", { event_id: event.id, email: signup.email });
      }
    }
  }

  return json({ events, sent, failed });
});
