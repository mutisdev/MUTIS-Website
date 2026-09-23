// Transactional email through Brevo, shared by send-signup-confirmation and
// send-event-reminders. Templates live in ./email_templates and use
// {{PLACEHOLDER}} tokens; each function that imports this must list those
// files under `static_files` in supabase/config.toml or they won't be deployed.
//
// Never throws: a failed send is logged and reported as `false`, so email
// trouble can't break whatever the caller is doing.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BREVO_URL = "https://api.brevo.com/v3/smtp/email";
const SENDER = { name: "MUTIS", email: "info@mutisfinancesociety.com" };
const SITE_URL = "https://mutisfinancesociety.com";
const LOGO_URL =
  "https://ktleyfwpcuyvvyxpvipp.supabase.co/storage/v1/object/public/brand_assets/MUTISLogo.png";
const TIME_ZONE = "Europe/London";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

/** Fill every {{KEY}} with the HTML-escaped value from params. Names and event
 * text come from visitors and admins, so they must never be inserted as raw
 * HTML. Tokens with no value become blank rather than failing. */
export function renderTemplate(html: string, params: Record<string, string | null | undefined>): string {
  return html.replace(/\{\{\s*([A-Z_]+)\s*\}\}/g, (_, key: string) => escapeHtml(params[key] ?? ""));
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
  params: Record<string, string | null | undefined>;
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
export function eventEmailParams(event: EmailEvent, attendeeName: string): Record<string, string> {
  const start = new Date(event.starts_at);
  const startTime = timeFormat.format(start);
  return {
    LOGO_URL,
    ATTENDEE_NAME: attendeeName,
    EVENT_NAME: event.title,
    EVENT_DESCRIPTION: event.description ?? "",
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
