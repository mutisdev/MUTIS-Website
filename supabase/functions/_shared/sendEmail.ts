// Transactional email through Brevo, shared by send-signup-confirmation and
// send-event-reminders. Templates live in ./email_templates and use
// {{PLACEHOLDER}} tokens; each function that imports this must list those
// files under `static_files` in supabase/config.toml or they won't be deployed.
//
// Never throws: a failed send is logged and reported as `false`, so email
// trouble can't break whatever the caller is doing.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import sanitizeHtml from "npm:sanitize-html@2.17.0";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "MUTIS", email: "info@mutisfinancesociety.com" };
const SITE_URL = "https://mutisfinancesociety.com";
/** Exported because every template's header uses it, including the auth-link
 * emails that don't go through eventEmailParams. */
export const LOGO_URL =
  "https://ktleyfwpcuyvvyxpvipp.supabase.co/storage/v1/object/public/brand_assets/MUTISLogo.png";
const TIME_ZONE = "Europe/London";

const escapeHtml = (value: string) =>
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
 * Functions run in UTC. */
export function eventEmailParams(event: EmailEvent, attendeeName: string): TemplateParams {
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
    EVENT_URL: `${SITE_URL}/events/${event.id}/signup`,
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
