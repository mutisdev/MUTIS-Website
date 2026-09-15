import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERCEL_API = "https://api.vercel.com";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
  if (callerError || !callerData.user) return json({ error: "Invalid session" }, 401);

  const { data: callerAdminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", callerData.user.id)
    .maybeSingle();
  if (!callerAdminRow) return json({ error: "Only admins can do this." }, 403);

  let body: { token?: string; projectId?: string; teamId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  const projectId = body.projectId?.trim();
  const teamId = body.teamId?.trim() || null;
  let token = body.token?.trim() || null;
  if (!projectId) return json({ error: "projectId is required" }, 400);

  // Token is optional so project/team IDs can be edited without re-pasting
  // it — fall back to the one already in Vault.
  if (!token) {
    const { data: existing } = await admin.rpc("etoro_get_secret", { secret_name: "vercel_analytics_token" });
    token = existing ?? null;
  }
  if (!token) return json({ error: "An access token is required" }, 400);

  // Validate before saving: one cheap count query for the last day.
  const params = new URLSearchParams({ projectId, since: String(Date.now() - 86_400_000), until: String(Date.now()) });
  if (teamId) params.set("teamId", teamId);
  const check = await fetch(`${VERCEL_API}/v1/query/web-analytics/visits/count?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!check.ok) {
    const detail = await check.text().catch(() => check.statusText);
    // 200 so supabase.functions.invoke hands the message to the form as data.error.
    return json({ error: `Vercel rejected the configuration (${check.status}): ${detail}` }, 200);
  }

  if (body.token?.trim()) {
    const { error: secretError } = await admin.rpc("etoro_set_secret", {
      secret_name: "vercel_analytics_token",
      secret_value: token,
    });
    if (secretError) return json({ error: `Could not store token: ${secretError.message}` }, 500);
  }

  const { error: settingsError } = await admin
    .from("vercel_analytics_settings")
    .update({
      project_id: projectId,
      team_id: teamId,
      is_configured: true,
      updated_at: new Date().toISOString(),
      updated_by: callerData.user.id,
    })
    .eq("id", true);
  if (settingsError) return json({ error: settingsError.message }, 500);

  return json({ ok: true }, 200);
});
