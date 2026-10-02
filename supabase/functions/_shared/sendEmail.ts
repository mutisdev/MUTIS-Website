// Transactional email through Brevo, shared by send-signup-confirmation and
// send-event-reminders. Templates live in ./email_templates and use
// {{PLACEHOLDER}} tokens; each function that imports this must list those
// files under `static_files` in supabase/config.toml or they won't be deployed.
//
// Never throws: a failed send is logged and reported as `false`, so email
// trouble can't break whatever the caller is doing.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import sanitizeHtml from "npm:sanitize-html@2.17.0";
import { tokenizeVideoDetails } from "./eventVideo.ts";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "MUTIS", email: "info@mutisfinancesociety.com" };
/** Exported because event-ics builds the same event links for the calendar
 * entry it serves. */
export const SITE_URL = "https://mutisfinancesociety.com";
/** Exported because every template's header uses it, including the auth-link
 * emails that don't go through eventEmailParams. */
export const LOGO_URL =
  "https://ktleyfwpcuyvvyxpvipp.supabase.co/storage/v1/object/public/brand_assets/MUTISLogo.png";
const TIME_ZONE = "Europe/London";

/** Exported because submit-application builds a repeating answers table as one
 * SafeHtml value: renderTemplate only escapes scalars, and emailSafeHtml is for
 * the admin rich-text editor's markup, not for an applicant's plain text. */
export const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** A param value that is already safe HTML and is inserted as-is. Only
 * emailSafeHtml should make one. */
export type SafeHtml = { html: string };
type TemplateParams = Record<string, string | SafeHtml | null | undefined>;

/** Fill every {{KEY}} with the HTML-escaped value from params. Names and event
 * text come from visitors and admins, so they must never be inserted as raw
 * HTML; the one exception is a SafeHtml value. Tokens with no value become
 * blank rather than failing. */
export function renderTemplate(html: string, params: TemplateParams): string {
  return html.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, key: string) => {
    const value = params[key];
    return typeof value === "object" && value !== null ? value.html : escapeHtml(value ?? "");
  });
}

// Inline styles for each tag the admin rich-text editor (TipTap StarterKit +
// Image) produces. Email clients ignore <style> blocks, so every element
// carries its own.
const TEXT = "font-size:14px; line-height:1.6; color:#555555;";
const EMAIL_TAG_STYLES: Record<string, string> = {
  p: `margin:0 0 12px; ${TEXT}`,
  h1: "margin:0 0 12px; font-size:19px; line-height:1.4; color:#0B2545;",
  h2: "margin:0 0 12px; font-size:17px; line-height:1.4; color:#0B2545;",
  h3: "margin:0 0 12px; font-size:15px; line-height:1.4; color:#0B2545;",
  ul: `margin:0 0 12px; padding-left:22px; ${TEXT}`,
  ol: `margin:0 0 12px; padding-left:22px; ${TEXT}`,
  li: `margin:0 0 4px; ${TEXT}`,
  blockquote: `margin:0 0 12px; padding-left:14px; border-left:2px solid #d0d4dc; ${TEXT}`,
  a: "color:#0077B6; text-decoration:underline;",
  img: "display:block; max-width:100%; height:auto; border:0; margin:12px 0; border-radius:8px;",
  hr: "border:0; border-top:1px solid #e2e4ea; margin:16px 0;",
  pre: "margin:0 0 12px; font-size:13px; white-space:pre-wrap;",
};

/** An admin's rich-text description as HTML that is safe to put in an email:
 * only the editor's own tags survive (no scripts or event handlers), links
 * and images must be http(s), and any style the admin's HTML carried is
 * replaced by the inline style above. Paragraphs inside list items lose
 * their margin so bullets aren't double-spaced. */
export function emailSafeHtml(html: string | null | undefined): SafeHtml {
  const styled = (tagName: string, attribs: Record<string, string>) => ({
    tagName,
    attribs: { ...attribs, style: EMAIL_TAG_STYLES[tagName] },
  });
  const clean = sanitizeHtml(html ?? "", {
    allowedTags: [...Object.keys(EMAIL_TAG_STYLES), "br", "strong", "b", "em", "i", "u", "s", "code"],
    // transformTags runs before this filter, so `style` here only ever holds ours.
    allowedAttributes: {
      ...Object.fromEntries(Object.keys(EMAIL_TAG_STYLES).map((tag) => [tag, ["style"]])),
      a: ["href", "style"],
      img: ["src", "alt", "style"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    transformTags: Object.fromEntries(Object.keys(EMAIL_TAG_STYLES).map((tag) => [tag, styled])),
    // The editor leaves an empty <p></p> behind trailing lists and blank lines;
    // an image whose src failed the scheme check would be an empty box.
    exclusiveFilter: (frame) =>
      (frame.tag === "p" && !frame.text.trim() && frame.mediaChildren.length === 0) || (frame.tag === "img" && !frame.attribs.src),
  });
  return { html: clean.replace(/(<li[^>]*>\s*<p style=")margin:0 0 12px;/g, "$1margin:0;") };
}

/**
 * An event's video conference details as the "Joining online" block both the
 * confirmation and the reminders carry. The stored text is plain text an admin
 * typed or pasted, so it is escaped in full and only https links are turned
 * into links — anything else (an <a> pasted from a web page, a mailto:, a bare
 * www.) stays inert text. Newlines become <br> so a pasted meeting ID,
 * passcode and dial-in each keep their own line.
 *
 * Returns an empty SafeHtml when there is nothing to show, which is what makes
 * {{VIDEO_BLOCK}} disappear entirely for in-person events rather than leaving
 * an empty heading behind.
 */
export function videoDetailsBlock(bodyText: string | null | undefined): SafeHtml {
  const text = (bodyText ?? "").trim();
  if (!text) return { html: "" };

  const body = tokenizeVideoDetails(text)
    .map((token) =>
      token.type === "link"
        ? `<a href="${escapeHtml(token.value)}" style="color:#0c6a8a; text-decoration:underline; word-break:break-all;">${escapeHtml(token.value)}</a>`
        : escapeHtml(token.value).replaceAll("\n", "<br>")
    )
    .join("");

  // A tinted card with an accent rule rather than a coloured fill, so no text
  // sits on the accent. #0c6a8a is the design brief's deeper cyan taken two
  // steps darker: the brief's own #0e7fa3 is 4.58:1 on white but only 4.32:1 on
  // this card, which fails AA for 14px text — #0c6a8a is 5.75:1 on it. The links
  // are underlined too, so colour is never the only signal. Tables, not divs,
  // because Outlook ignores padding and borders on a div.
  return {
    html: `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px; background-color:#f4f9fc; border-left:4px solid #0c6a8a; border-radius:6px;">
        <tr>
          <td style="padding:18px 22px;">
            <h2 style="margin:0 0 10px; font-size:16px; line-height:1.4; color:#0B2545;">Joining online</h2>
            <p style="margin:0; font-size:14px; line-height:1.7; color:#333333;">${body}</p>
          </td>
        </tr>
      </table>`,
  };
}

export async function sendTemplatedEmail({
  to,
  subject,
  templateFile,
  params,
}: {
  to: string;
  subject: string;
  templateFile: string;
  params: TemplateParams;
}): Promise<boolean> {
  try {
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) {
      console.error("BREVO_API_KEY is not set; email not sent", { templateFile });
      return false;
    }
    const template = await Deno.readTextFile(new URL(`./email_templates/${templateFile}`, import.meta.url));

    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email: to }],
        subject,
        htmlContent: renderTemplate(template, params),
      }),
    });
    if (!res.ok) {
      console.error("Brevo rejected email", { templateFile, status: res.status, body: await res.text() });
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to send email", { templateFile, err });
    return false;
  }
}

type EmailEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
};

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "numeric", minute: "2-digit" });

/** The template params both emails share. Dates are shown in UK time: Edge
 * Functions run in UTC, and Intl handles British Summer Time for us, so an
 * event in August reads as BST even when the reminder is sent in UTC-time
 * October.
 *
 * `videoDetails` is the raw event_video_details.body_text, passed only when the
 * event has the block and it is switched on. Omitting it renders
 * {{VIDEO_BLOCK}} as nothing, which is how every in-person event's email stays
 * byte-for-byte what it was before this existed. */
export function eventEmailParams(
  event: EmailEvent,
  attendeeName: string,
  videoDetails?: string | null
): TemplateParams {
  const start = new Date(event.starts_at);
  const startTime = timeFormat.format(start);
  return {
    LOGO_URL,
    ATTENDEE_NAME: attendeeName,
    EVENT_NAME: event.title,
    EVENT_DESCRIPTION: emailSafeHtml(event.description),
    EVENT_DATE: dateFormat.format(start),
    EVENT_TIME: event.ends_at ? `${startTime} – ${timeFormat.format(new Date(event.ends_at))}` : startTime,
    EVENT_LOCATION: event.location ?? "",
    VIDEO_BLOCK: videoDetailsBlock(videoDetails),
    EVENT_URL: `${SITE_URL}/events/${event.id}/signup`,
    // A link rather than an attached file: Gmail and Outlook both strip
    // calendar attachments from bulk senders, and a link always survives.
    ICS_URL: `${Deno.env.get("SUPABASE_URL")}/functions/v1/event-ics?event=${event.id}`,
  };
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Both email functions have verify_jwt off (called from Postgres), so they
 * authorise with the `x-webhook-secret` header against the Vault secret
 * `email_webhook_secret`. */
export async function hasWebhookSecret(req: Request, admin: SupabaseClient): Promise<boolean> {
  const provided = req.headers.get("x-webhook-secret");
  if (!provided) return false;
  const { data: secret } = await admin.rpc("etoro_get_secret", { secret_name: "email_webhook_secret" });
  return typeof secret === "string" && secret.length > 0 && timingSafeEqual(provided, secret);
}
