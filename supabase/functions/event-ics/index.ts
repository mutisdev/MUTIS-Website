import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { SITE_URL } from "../_shared/sendEmail.ts";

// Serves a published event as an .ics file so attendees can add it to their
// calendar. Linked from the confirmation and reminder emails.
//
// GET ?event=<uuid>. verify_jwt is off: the links are opened straight from an
// inbox with no session, and the file only holds what the public event page
// already shows.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Calendars treat an event with no end as zero-length, so give it an hour.
const DEFAULT_DURATION_MS = 3_600_000;

/** 20261001T180000Z. Times go out as UTC so each calendar shows them in the
 * attendee's own zone; no VTIMEZONE block needed. */
const icsDate = (date: Date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** TEXT values must escape \ ; , and newlines (RFC 5545 section 3.3.11). */
const icsText = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll(";", "\\;").replaceAll(",", "\\,").replace(/\r?\n/g, "\\n");

/** Lines longer than 75 octets are folded onto continuation lines starting
 * with a space (RFC 5545 section 3.1). Iterates code points so a multi-byte
 * character is never cut in half. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines lose one octet to the leading space.
    if (bytes + size > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The admin's rich-text description as the plain text a calendar entry takes. */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    // Last: an escaped entity in the source must not turn into a live one.
    .replaceAll("&amp;", "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });

  const eventId = new URL(req.url).searchParams.get("event") ?? "";
  if (!UUID.test(eventId)) return new Response("Event not found", { status: 404 });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: event, error } = await admin
    .from("events")
    .select("id, title, description, location, starts_at, ends_at")
    .eq("id", eventId)
    .eq("is_published", true)
    .maybeSingle();
  if (error) {
    console.error("Failed to load event for ics", eventId, error);
    return new Response("Something went wrong", { status: 500 });
  }
  if (!event) return new Response("Event not found", { status: 404 });

  const start = new Date(event.starts_at);
  const end = event.ends_at ? new Date(event.ends_at) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  const eventUrl = `${SITE_URL}/events/${event.id}/signup`;
  const description = [htmlToText(event.description ?? ""), eventUrl].filter(Boolean).join("\n\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MUTIS//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    // Stable per event, so re-adding it updates the entry instead of duplicating it.
    `UID:${event.id}@mutisfinancesociety.com`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(event.title)}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    `URL:${eventUrl}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return new Response(lines.map(foldLine).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mutis-event.ics"',
      // An admin can move an event after the emails have gone out.
      "Cache-Control": "no-store",
    },
  });
});
