import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { eventEmailParams, hasWebhookSecret, sendTemplatedEmail } from "../_shared/sendEmail.ts";
import {
  isReminderDue,
  REMINDER_COPY,
  REMINDER_TYPES,
  reminderCandidateWindow,
  type ReminderType,
} from "../_shared/eventVideo.ts";

// Sends event reminders to everyone with a confirmed sign-up. Run every 5
// minutes by pg_cron.
//
// Two reminders exist (see REMINDER_SCHEDULE in ../_shared/eventVideo.ts):
//   24h — every published event, exactly as before this function was extended
//   1h  — only events with a switched-on event_video_details row, because a
//         joining link is worth putting in front of someone right before they
//         need it in a way a room number isn't
//
// Nothing is sent twice. A reminders_sent row is claimed per (sign-up, reminder
// type, event start time) BEFORE the email is handed to Brevo, under a unique
// index, so overlapping or repeated runs can't double-send. Unlike the previous
// per-event claim, a crash part-way through a batch now only loses the one
// recipient in flight: the rest are still unclaimed and the next run picks them
// up, as does a recipient whose send failed.
//
// Nothing is sent late either. Each reminder has a window; an event created,
// switched to video, or re-timed after its window has passed simply isn't in it
// any more, so that reminder is skipped rather than arriving after the fact.
// Re-timing an event re-arms the reminders still ahead of it for free, because
// the new starts_at doesn't match the rows recorded against the old one.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** How long a claimed-but-unfinished row is left alone before another run may
 * retry it. Longer than any single Brevo call plus the function's own timeout,
 * so a row still in flight is never picked up twice; short enough that a run
 * killed mid-send is retried within a few cycles. */
const CLAIM_STALE_MINUTES = 15;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type DueEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  requires_application: boolean;
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (!(await hasWebhookSecret(req, admin))) return json({ error: "Unauthorised" }, 401);

  const now = new Date();
  const candidateWindow = reminderCandidateWindow(now);

  // One query for both reminders: everything starting anywhere inside the
  // widest window either of them could want, then each event is tested per
  // reminder type below.
  const { data: candidates, error: eventsError } = await admin
    .from("events")
    .select("id, title, description, location, starts_at, ends_at, requires_application")
    .eq("is_published", true)
    .gte("starts_at", candidateWindow.from.toISOString())
    .lte("starts_at", candidateWindow.to.toISOString());
  if (eventsError) {
    console.error("Failed to find due events", eventsError);
    return json({ error: "Database error" }, 500);
  }

  let sent = 0, failed = 0, skipped = 0;
  const reminders: { event_id: string; reminder_type: ReminderType; sent: number; failed: number }[] = [];

  for (const event of (candidates ?? []) as DueEvent[]) {
    const startsAt = new Date(event.starts_at);

    // Video details are read once per event, not once per recipient. An event
    // with no row, or one whose toggle is off, gets `null` — which is both "no
    // joining block in the email" and "no 1h reminder".
    const { data: video, error: videoError } = await admin
      .from("event_video_details")
      .select("body_text, is_enabled")
      .eq("event_id", event.id)
      .maybeSingle();
    if (videoError) {
      // Don't guess. Sending the 24h reminder without a joining link an admin
      // did add would be worse than sending it a few minutes later, so leave
      // the whole event for the next run.
      console.error("Failed to load video details for event", event.id, videoError);
      failed++;
      continue;
    }
    // TODO(application flow): see the matching note in
    // send-signup-confirmation. An application-mode event has no event_signups
    // rows today, so this loop never reaches one; the guard is here so that
    // when accepted applications do become sign-ups, a joining link can't go
    // out to someone whose place hasn't been confirmed.
    const videoDetails = !event.requires_application && video?.is_enabled ? video.body_text : null;

    const dueTypes = REMINDER_TYPES.filter((type) => {
      if (!isReminderDue(type, startsAt, now)) return false;
      // The 1h reminder exists for the joining link; without one there is
      // nothing it would say that the 24h reminder didn't.
      if (type === "1h" && !videoDetails) return false;
      return true;
    });
    if (dueTypes.length === 0) continue;

    const { data: signups, error: signupsError } = await admin
      .from("event_signups")
      .select("id, name, email")
      .eq("event_id", event.id)
      .eq("status", "confirmed");
    if (signupsError) {
      console.error("Failed to load signups for event", event.id, signupsError);
      failed++;
      continue;
    }

    for (const type of dueTypes) {
      const counts = { event_id: event.id, reminder_type: type, sent: 0, failed: 0 };

      for (const signup of signups ?? []) {
        // Claim first. The unique index on (signup_id, reminder_type,
        // event_starts_at) means the insert below either creates the claim or
        // collides with an existing one; the ON CONFLICT only takes it over
        // when that one is neither already sent nor still plausibly in flight.
        // Nothing comes back in any other case, which is the signal to skip.
        const { data: claim, error: claimError } = await admin.rpc("claim_event_reminder", {
          p_signup_id: signup.id,
          p_reminder_type: type,
          p_event_starts_at: event.starts_at,
          p_stale_minutes: CLAIM_STALE_MINUTES,
        });
        if (claimError) {
          console.error("Failed to claim reminder", { signup_id: signup.id, type, claimError });
          counts.failed++;
          failed++;
          continue;
        }
        if (!claim) {
          skipped++;
          continue;
        }

        const copy = REMINDER_COPY[type];
        const ok = await sendTemplatedEmail({
          to: signup.email,
          subject: copy.subject(event.title),
          templateFile: "reminder.html",
          params: {
            ...eventEmailParams(event, signup.name, videoDetails),
            REMINDER_BADGE: copy.badge,
            REMINDER_WHEN: copy.when,
          },
        });

        if (ok) {
          await admin
            .from("reminders_sent")
            .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
            .eq("id", claim);
          counts.sent++;
          sent++;
        } else {
          // Recorded as failed rather than left pending, so the row says plainly
          // that this one didn't go out. The next run retries it.
          await admin
            .from("reminders_sent")
            .update({ status: "failed", last_error: "Brevo send failed; see function logs" })
            .eq("id", claim);
          counts.failed++;
          failed++;
          console.error("Reminder not sent", { event_id: event.id, type, email: signup.email });
        }
      }

      // Kept truthful for the admin panel and for anyone reading the events
      // table directly: this column is no longer what stops a second send (the
      // reminders_sent rows are), it's just the record of when the 24h reminder
      // first went out.
      if (type === "24h" && counts.sent > 0) {
        await admin
          .from("events")
          .update({ reminder_sent_at: new Date().toISOString() })
          .eq("id", event.id)
          .is("reminder_sent_at", null);
      }

      if (counts.sent > 0 || counts.failed > 0) reminders.push(counts);
    }
  }

  return json({ sent, failed, skipped, reminders });
});
