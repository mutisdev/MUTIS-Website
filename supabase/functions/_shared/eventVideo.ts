// Everything both sides need to agree on for an event's video conference
// details: the length limit, what counts as a valid block, how the text is
// broken into links and plain text, and when each reminder is due.
//
// Imported by the send-signup-confirmation and send-event-reminders Edge
// Functions (Deno) and by the admin panel (via the `@shared` alias in
// vite.config.ts / tsconfig.json), so — like uniEmail.ts and
// eventApplications.ts — it must stay plain TypeScript with no imports and no
// Deno or DOM APIs.

/** The admin textarea's cap, enforced again by the event_video_details CHECK. */
export const MAX_VIDEO_DETAILS_CHARS = 1000;

/**
 * The block is treated as plain text throughout: it's typed by an admin and
 * pasted from Teams/Zoom/Meet, so it carries meeting IDs and passcodes that
 * must survive verbatim, and nothing that looks like markup should ever reach
 * an email as markup. tokenizeVideoDetails is the only reader; it hands back
 * links and text separately so each side can escape in its own way.
 */
export type VideoDetailsToken = { type: "text" | "link"; value: string };

// Only https. http would be downgraded by most clients anyway, and every
// conferencing provider has been https-only for years, so allowing it would
// add risk for no reach. Anything else in the text (mailto:, tel:, a bare
// www., an <a> an admin pasted from a web page) stays inert text.
const HTTPS_URL = /https:\/\/[^\s<>"']+/g;
// A URL at the end of a sentence picks up the punctuation that followed it;
// a closing bracket only counts as part of the URL if it was opened inside it.
const TRAILING_PUNCTUATION = /[.,;:!?'")\]}>]+$/;

function trimUrl(url: string): string {
  let trimmed = url;
  for (;;) {
    const next = trimmed.replace(TRAILING_PUNCTUATION, "");
    // A trailing ")" that closes a "(" from inside the URL belongs to it —
    // Teams and Confluence links really do contain brackets.
    if (next !== trimmed && trimmed.endsWith(")") && countChar(next, "(") > countChar(next, ")")) return trimmed;
    if (next === trimmed) return trimmed;
    trimmed = next;
  }
}

function countChar(value: string, char: string): number {
  let n = 0;
  for (const c of value) if (c === char) n++;
  return n;
}

/**
 * Splits the block into the https links it contains and the plain text around
 * them. Newlines are left in the text values; the renderer decides how to show
 * them (a <br> in email, white-space: pre-line on screen).
 */
export function tokenizeVideoDetails(text: string): VideoDetailsToken[] {
  const tokens: VideoDetailsToken[] = [];
  let cursor = 0;
  for (const match of text.matchAll(HTTPS_URL)) {
    const start = match.index ?? 0;
    const url = trimUrl(match[0]);
    if (start > cursor) tokens.push({ type: "text", value: text.slice(cursor, start) });
    tokens.push({ type: "link", value: url });
    cursor = start + url.length;
  }
  if (cursor < text.length) tokens.push({ type: "text", value: text.slice(cursor) });
  return tokens;
}

/** The links in the block, in the order they appear. */
export function videoDetailsLinks(text: string): string[] {
  return tokenizeVideoDetails(text).filter((t) => t.type === "link").map((t) => t.value);
}

/**
 * The rules the admin form and the database both hold the block to: non-blank,
 * within the length cap, and containing at least one https link — a block with
 * no joining link is worse than none at all, because it reads as if it were
 * complete. Returns a message to show, or null when the block is fine.
 */
export function validateVideoDetails(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "Add the joining link and any meeting ID or passcode, or turn this off.";
  if (trimmed.length > MAX_VIDEO_DETAILS_CHARS) {
    return `Keep this under ${MAX_VIDEO_DETAILS_CHARS} characters (currently ${trimmed.length}).`;
  }
  if (videoDetailsLinks(trimmed).length === 0) {
    return "Include the full joining link, starting with https://";
  }
  return null;
}

// ---- reminders ----

/**
 * The reminders an event can send. '24h' is the original one every event has
 * always had; '1h' is sent as well, and only for events with a video block,
 * because a joining link is worth putting in front of someone right before
 * they need it in a way a room number isn't.
 */
export const REMINDER_TYPES = ["24h", "1h"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export function isReminderType(value: string): value is ReminderType {
  return (REMINDER_TYPES as readonly string[]).includes(value);
}

/**
 * How long before the start each reminder goes out, and how late is still
 * acceptable. A reminder is sent when the time to the start is between
 * `leadMinutes - graceMinutes` and `leadMinutes`; past that it is skipped
 * rather than sent late, which is what makes an event created, switched to
 * video, or re-timed inside its own window quietly miss that reminder instead
 * of surprising people with one.
 *
 * The grace windows are sized against the cron interval (every 5 minutes), not
 * guessed: an hour of slack on the 24h reminder keeps the original behaviour,
 * where an hourly job could be a run late; 20 minutes on the 1h reminder is
 * four runs' worth, and still unambiguously "starting soon".
 */
export const REMINDER_SCHEDULE: Record<ReminderType, { leadMinutes: number; graceMinutes: number }> = {
  "24h": { leadMinutes: 24 * 60, graceMinutes: 60 },
  "1h": { leadMinutes: 60, graceMinutes: 20 },
};

/**
 * Whether `type`'s window is open for an event starting at `startsAt`, as of
 * `now`. Pure arithmetic on absolute instants, so it is unaffected by the
 * server's zone and by British Summer Time starting or ending between now and
 * the event: "24 hours before" means 24 hours of elapsed time either way. Only
 * what the emails *say* the time is gets converted to Europe/London, which is
 * where a DST change actually has to be handled (see eventEmailParams).
 */
export function isReminderDue(type: ReminderType, startsAt: Date, now: Date): boolean {
  const minutesUntil = (startsAt.getTime() - now.getTime()) / 60_000;
  const { leadMinutes, graceMinutes } = REMINDER_SCHEDULE[type];
  return minutesUntil <= leadMinutes && minutesUntil > leadMinutes - graceMinutes;
}

/**
 * The wording each reminder uses, so the subject line, the badge and the
 * opening sentence can't drift apart. reminder.html is one template for both:
 * the difference between them is three strings, not two layouts.
 */
export const REMINDER_COPY: Record<ReminderType, { badge: string; when: string; subject: (title: string) => string }> = {
  "24h": {
    badge: "HAPPENING TOMORROW",
    when: "is tomorrow",
    subject: (title) => `Reminder: ${title} is tomorrow`,
  },
  "1h": {
    badge: "STARTING SOON",
    // Deliberately vague: the window is 20 minutes wide, so "in an hour" would
    // be wrong for anyone reading it at either end of it.
    when: "starts in about an hour",
    subject: (title) => `Starting soon: ${title}`,
  },
};

/** The widest span of start times any reminder could be due for, used to fetch
 * candidate events in one query. */
export function reminderCandidateWindow(now: Date): { from: Date; to: Date } {
  const leads = REMINDER_TYPES.map((t) => REMINDER_SCHEDULE[t]);
  const earliest = Math.min(...leads.map((l) => l.leadMinutes - l.graceMinutes));
  const latest = Math.max(...leads.map((l) => l.leadMinutes));
  return {
    from: new Date(now.getTime() + earliest * 60_000),
    to: new Date(now.getTime() + latest * 60_000),
  };
}
