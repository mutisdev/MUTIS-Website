import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import type { Session } from "@supabase/supabase-js";
import { validateVideoDetails } from "@shared/eventVideo";

export type EventVideoDetailsRow = Database["public"]["Tables"]["event_video_details"]["Row"];

/**
 * An event's video conference joining block. Loaded and saved separately from
 * the event row because it lives in its own admin-only table — see
 * 20261002173823_event_video_details_and_reminders.sql for why it is not a
 * column on public.events.
 *
 * Loaded whether or not the toggle is currently on, for the same reason the
 * application questions are: the toggle hides the block, it never deletes it,
 * so an admin turning it back on must find their text still there.
 */
export async function loadEventVideoDetails(eventId: string): Promise<EventVideoDetailsRow | null> {
  const { data, error } = await supabase
    .from("event_video_details")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/**
 * event_video_details isn't in useAdminMutation's ContentTable — its primary key
 * is event_id rather than id — so the audit entry is written here, the same way
 * Applications.tsx and Submissions.tsx do for the tables they own. row_id is the
 * event id, which is this row's key.
 */
async function logVideoDetailsChange(
  session: Session | null,
  eventId: string,
  action: "insert" | "update",
  before: unknown,
  after: unknown
) {
  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: session?.user.id ?? null,
    actor_email: session?.user.email ?? "unknown",
    table_name: "event_video_details",
    row_id: eventId,
    action,
    before: before as never,
    after: after as never,
  });
  // Best-effort, like every other audit write: a logging failure must not undo a
  // change that already succeeded.
  if (error) console.error(`Failed to write audit log entry for event_video_details/${eventId}`, error);
}

/**
 * Writes the drawer's video state for one event. Called after the event row is
 * saved, so there is always an event id to hang it on.
 *
 * Nothing is ever deleted here. Turning the toggle off writes is_enabled =
 * false and leaves body_text alone, which is what makes the toggle
 * non-destructive; an event that has never had a block and still doesn't gets
 * no row at all, so every existing event stays exactly as it is.
 */
export async function saveEventVideoDetails(
  eventId: string,
  { enabled, bodyText }: { enabled: boolean; bodyText: string },
  saved: EventVideoDetailsRow | null,
  session: Session | null
): Promise<void> {
  const typed = bodyText.trim();

  // What to store when the toggle is off: the text the admin has in the box if
  // it is usable, otherwise whatever was already stored. Either way the block
  // survives being switched off and can be switched back on unchanged.
  const body = enabled
    ? typed
    : validateVideoDetails(typed) === null
      ? typed
      : (saved?.body_text ?? "");

  // Nothing to store and nothing stored: leave the table untouched rather than
  // writing an empty row for every in-person event.
  if (!body) return;
  // Unchanged: skip the write so the audit log doesn't fill with no-ops.
  if (saved && saved.is_enabled === enabled && saved.body_text === body) return;

  const values = { event_id: eventId, is_enabled: enabled, body_text: body, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from("event_video_details")
    .upsert(values, { onConflict: "event_id" })
    .select()
    .single();
  if (error) throw error;
  await logVideoDetailsChange(session, eventId, saved ? "update" : "insert", saved, data);
}
