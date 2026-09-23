// Invites a new admin without touching Supabase's built-in mailer, which is
// capped at 2 emails/hour. `generateLink` creates the account and mints the
// magic link but sends nothing; delivery goes through Brevo like every other
// email we send. Never call inviteUserByEmail() here — that would reintroduce
// the rate limit this function exists to avoid.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { LOGO_URL, sendTemplatedEmail } from "../_shared/sendEmail.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Must match a Redirect URL allowlisted under Authentication > URL
// Configuration, including the `www.` — GoTrue does not reject an
// unlisted redirect_to, it silently substitutes the Site URL, which would
// drop invitees on the homepage instead of the set-password form.
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

Deno.serve(async (req: Request) => {
  // supabase-js sends an Authorization header on every call, which makes the
  // browser preflight with OPTIONS first — without a 2xx response to that,
  // the actual POST never goes out and invoke() fails with a network error.
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Identify the caller from their JWT.
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
  if (callerError || !callerData.user) return json({ error: "Invalid session" }, 401);
  const caller = callerData.user;

  // Verify the caller is themselves already an admin before doing anything
  // privileged — this endpoint creates accounts, so it must never be open.
  const { data: callerAdminRow } = await admin
    .from("admin_users")
    .select("user_id, full_name, email")
    .eq("user_id", caller.id)
    .maybeSingle();
  if (!callerAdminRow) return json({ error: "Only current admins can invite people." }, 403);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) return json({ error: "Email is required" }, 400);

  // `welcome` marks this as a first-time setup rather than a forgotten
  // password, so the page says "Set up your account" even on the recovery
  // link used for the promote-an-existing-account case below. Supabase keeps
  // the query string and appends its own params to it.
  const redirectTo = `${SITE_URL}/admin/set-password?welcome=1`;

  // Creates the auth user in the "invited" state and returns the magic link.
  // No email leaves Supabase as a result of this call.
  let { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  if (linkError) {
    const message = linkError.message.toLowerCase();
    const alreadyExists = message.includes("already been registered") ||
      message.includes("already registered") ||
      linkError.code === "email_exists";
    if (!alreadyExists) return json({ error: linkError.message }, 500);

    // An invite only works for a brand new address, but someone who already
    // has an account (a member, or an admin who was removed) can still be
    // given access. A recovery link does the same job: it lands on the same
    // page and lets them set a password and their name. It also hands back
    // the user, so there's no need to page through listUsers to find them.
    ({ data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    }));
    if (linkError) return json({ error: linkError.message }, 500);
  }

  const actionLink = linkData?.properties?.action_link;
  const invitedUser = linkData?.user;
  if (!actionLink || !invitedUser) return json({ error: "Could not generate an invite link." }, 500);

  // Grant admin access up front so they land on the dashboard rather than the
  // "access pending" screen once they've set a password.
  const { data: inserted, error: insertError } = await admin
    .from("admin_users")
    .insert({ user_id: invitedUser.id, email: invitedUser.email ?? email, full_name: null, added_by: caller.id })
    .select()
    .single();
  if (insertError) {
    if (insertError.code === "23505") return json({ error: "That person is already an admin." }, 409);
    return json({ error: insertError.message }, 500);
  }

  const sent = await sendTemplatedEmail({
    to: email,
    subject: "You've been invited to the MUTIS admin panel",
    templateFile: "invite.html",
    params: {
      LOGO_URL,
      ACTION_LINK: actionLink,
      INVITER_NAME: callerAdminRow.full_name ?? callerAdminRow.email ?? "A MUTIS admin",
      EXPIRY_TEXT,
    },
  });

  // sendTemplatedEmail swallows its own errors because a missed event email is
  // survivable. This one isn't: without it the invitee has an account they can
  // never reach, so surface the failure instead of reporting success.
  if (!sent) {
    return json({ error: "The account was created but the invite email could not be sent." }, 502);
  }

  return json({ admin: inserted }, 200);
});
