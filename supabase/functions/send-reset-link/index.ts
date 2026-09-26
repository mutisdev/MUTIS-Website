// Password reset for admins, delivered through Brevo rather than Supabase's
// built-in mailer and its 2 emails/hour cap. `generateLink` mints the recovery
// link without sending anything.
//
// Unauthenticated by necessity — someone locked out has no session — so it is
// written to give nothing away: every request gets the same 200, whether the
// address belongs to an admin, belongs to nobody, or the send failed. The real
// outcome only appears in the logs.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { LOGO_URL, sendTemplatedEmail } from "../_shared/sendEmail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// The emailed link points straight at our own set-password page, so this no
// longer needs to be a GoTrue redirect URL.
const SITE_URL = "https://www.mutisfinancesociety.com";
// Wording only — the real TTL is mailer_otp_exp in the project's auth config,
// currently 86400s. Update this if that changes.
const EXPIRY_TEXT = "24 hours";

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

/** The single response every caller sees, whatever actually happened. */
const ok = () => json({ ok: true }, 200);

/** `_` and `%` are LIKE wildcards and `_` is perfectly ordinary in an email
 * address, so an unescaped pattern could match a different admin's row and
 * send them a link meant for someone else. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return ok();
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return ok();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // The panel is admin-only, so there is no account here that isn't in
  // admin_users — anything else is either a typo or someone probing. Matched
  // case-insensitively, and without maybeSingle(), because nothing constrains
  // admin_users.email to be lowercase or unique.
  const { data: adminRows } = await admin
    .from("admin_users")
    .select("user_id")
    .ilike("email", escapeLike(email))
    .limit(1);
  if (!adminRows?.length) {
    console.log("Reset requested for an address with no admin account");
    return ok();
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email });

  if (linkError || !linkData.properties?.hashed_token) {
    console.error("Could not generate a recovery link", linkError);
    return ok();
  }

  // Not `action_link`, which a mail scanner would spend just by opening it —
  // see create-invite. The set-password page spends the token on a click.
  const resetLink = `${SITE_URL}/admin/set-password?${new URLSearchParams({
    type: "recovery",
    token_hash: linkData.properties.hashed_token,
  })}`;

  const sent = await sendTemplatedEmail({
    to: email,
    subject: "Reset your MUTIS admin password",
    templateFile: "reset.html",
    params: {
      LOGO_URL,
      ACTION_LINK: resetLink,
      EXPIRY_TEXT,
    },
  });
  if (!sent) console.error("Recovery link generated but the email failed to send");

  return ok();
});
