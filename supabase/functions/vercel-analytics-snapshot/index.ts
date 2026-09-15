import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Copies Vercel Web Analytics into Supabase (site_traffic_* tables) so history
// outlives Vercel's reporting window (1 month on Hobby). Invoked nightly by
// pg_cron with the `x-snapshot-secret` header, or manually by an admin.
//
// Body: { days?: number } — how many complete UTC days back to (re)fetch,
// default 3 so late-arriving Vercel data is corrected. Upserts, so re-runs
// are safe.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERCEL_API = "https://api.vercel.com";
const DAY_MS = 86_400_000;
// Vercel Hobby retains ~1 month. Days older than this come back as zeros, so
// never re-fetch them — that would overwrite saved history. Month totals are
// likewise only written while the whole month is still retained (31 so the
// run on the 1st can still finalise a 31-day previous month).
const RETENTION_DAYS = 31;

const BREAKDOWNS = [
  { dimension: "page", by: "requestPath", limit: "100" },
  { dimension: "referrer", by: "referrerHostname", limit: "25" },
  { dimension: "device", by: "deviceType", limit: "10" },
  { dimension: "country", by: "country", limit: "25" },
] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-snapshot-secret",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // verify_jwt is off for this function (pg_cron has no user session), so
  // authorise here: the cron shared secret, or a signed-in admin.
  const providedSecret = req.headers.get("x-snapshot-secret");
  let authorised = false;
  if (providedSecret) {
    const { data: secret } = await admin.rpc("etoro_get_secret", { secret_name: "vercel_snapshot_secret" });
    authorised = !!secret && timingSafeEqual(providedSecret, secret);
  } else {
    const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (jwt) {
      const { data: callerData } = await admin.auth.getUser(jwt);
      if (callerData.user) {
        const { data: row } = await admin
          .from("admin_users")
          .select("user_id")
          .eq("user_id", callerData.user.id)
          .maybeSingle();
        authorised = !!row;
      }
    }
  }
  if (!authorised) return json({ error: "Unauthorised" }, 401);

  let body: { days?: number } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body — defaults.
  }
  const days = Math.max(1, Math.min(Math.floor(Number(body.days) || 3), RETENTION_DAYS));

  const { data: settings } = await admin
    .from("vercel_analytics_settings")
    .select("project_id, team_id, is_configured")
    .eq("id", true)
    .maybeSingle();
  const { data: token } = await admin.rpc("etoro_get_secret", { secret_name: "vercel_analytics_token" });
  if (!settings?.is_configured || !settings.project_id || !token) {
    return json({ skipped: "Vercel Web Analytics is not configured" });
  }

  const query = async (path: string, extra: Record<string, string>, attempt = 0): Promise<unknown> => {
    const params = new URLSearchParams({ projectId: settings.project_id!, ...extra });
    if (settings.team_id) params.set("teamId", settings.team_id);
    const res = await fetch(`${VERCEL_API}/v1/query/web-analytics/${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      return query(path, extra, attempt + 1);
    }
    if (!res.ok) throw new Error(`Vercel ${path} (${extra.by ?? "count"}) returned ${res.status}: ${await res.text()}`);
    return (await res.json()).data;
  };

  // Range totals via aggregate grouped by `environment` (production-only by
  // default, so one row for the whole range = true range-level uniques).
  // visits/count returned zeros for bounded ranges on this project.
  const rangeTotals = async (since: string, until: string) => {
    const rows = ((await query("visits/aggregate", { since, until, by: "environment" })) ?? []) as Record<string, unknown>[];
    return rows.reduce<{ pageviews: number; visitors: number }>(
      (acc, r) => ({ pageviews: acc.pageviews + Number(r.pageviews ?? 0), visitors: acc.visitors + Number(r.visitors ?? 0) }),
      { pageviews: 0, visitors: 0 },
    );
  };

  const todayStart = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const results: { day: string; ok: boolean; error?: string }[] = [];

  // Daily totals for the whole window in one call.
  let series: Map<string, { pageviews: number; visitors: number }>;
  try {
    const rows = ((await query("visits/aggregate", {
      since: String(todayStart - days * DAY_MS),
      until: String(todayStart - 1),
      by: "day",
    })) ?? []) as Record<string, unknown>[];
    series = new Map(
      rows.map((r) => [
        String(r.timestamp).slice(0, 10),
        { pageviews: Number(r.pageviews ?? 0), visitors: Number(r.visitors ?? 0) },
      ]),
    );
  } catch (err) {
    return json({ error: `Daily series failed: ${err instanceof Error ? err.message : String(err)}` }, 502);
  }

  // Oldest first, one day at a time (4 Vercel calls each) to stay polite on rate limits.
  for (let i = days; i >= 1; i--) {
    const start = todayStart - i * DAY_MS;
    const end = start + DAY_MS - 1;
    const day = isoDay(start);
    const range = { since: String(start), until: String(end) };
    try {
      const count = series.get(day) ?? { pageviews: 0, visitors: 0 };
      const breakdowns = await Promise.all([
        ...BREAKDOWNS.map((b) =>
          (query("visits/aggregate", { ...range, by: b.by, limit: b.limit }) as Promise<Record<string, unknown>[]>)
            // A dimension the plan doesn't allow shouldn't lose the day's totals.
            .catch((err) => {
              console.error(`Snapshot ${day} ${b.dimension} failed`, err instanceof Error ? err.message : err);
              return null;
            }),
        ),
      ]);

      // Belt and braces for the zero-overwrite risk: if Vercel says zero but we
      // already hold real numbers for this day, keep what we have.
      if (!count?.pageviews) {
        const { data: existing } = await admin.from("site_traffic_daily").select("pageviews").eq("day", day).maybeSingle();
        if (existing && existing.pageviews > 0) {
          results.push({ day, ok: true, error: "kept existing (Vercel returned zero)" });
          continue;
        }
      }

      const fetchedAt = new Date().toISOString();
      const { error: dailyError } = await admin.from("site_traffic_daily").upsert({
        day,
        pageviews: count?.pageviews ?? 0,
        visitors: count?.visitors ?? 0,
        fetched_at: fetchedAt,
      });
      if (dailyError) throw new Error(dailyError.message);

      const rows = BREAKDOWNS.flatMap((b, idx) => {
        const data = breakdowns[idx];
        if (!data) return [];
        // Merge duplicates (e.g. empty and null referrer both mean "direct").
        const merged = new Map<string, { pageviews: number; visitors: number }>();
        for (const row of data) {
          const raw = row[b.by];
          const value = raw == null || raw === "" ? "(none)" : String(raw);
          if (b.dimension === "page" && value.startsWith("/admin")) continue;
          const prev = merged.get(value) ?? { pageviews: 0, visitors: 0 };
          merged.set(value, {
            pageviews: prev.pageviews + Number(row.pageviews ?? 0),
            visitors: prev.visitors + Number(row.visitors ?? 0),
          });
        }
        return [...merged].map(([value, v]) => ({ day, dimension: b.dimension, value, ...v, fetched_at: fetchedAt }));
      });
      if (rows.length) {
        const { error: breakdownError } = await admin.from("site_traffic_daily_breakdown").upsert(rows);
        if (breakdownError) throw new Error(breakdownError.message);
      }
      results.push({ day, ok: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Snapshot ${day} failed`, message);
      results.push({ day, ok: false, error: message });
    }
  }

  // True unique visitors per calendar month, for every month the run touched
  // whose start is still inside the retention window.
  const months: string[] = [];
  const monthErrors: string[] = [];
  const touched = new Set(results.filter((r) => r.ok).map((r) => r.day.slice(0, 7)));
  for (const ym of touched) {
    const [y, m] = ym.split("-").map(Number);
    const monthStart = Date.UTC(y, m - 1, 1);
    const monthEnd = Math.min(Date.UTC(y, m, 1) - 1, todayStart - 1);
    if (monthStart < todayStart - RETENTION_DAYS * DAY_MS) continue;
    try {
      const count = await rangeTotals(String(monthStart), String(monthEnd));
      const { error } = await admin.from("site_traffic_monthly").upsert({
        month: `${ym}-01`,
        pageviews: count?.pageviews ?? 0,
        visitors: count?.visitors ?? 0,
        fetched_at: new Date().toISOString(),
      });
      if (error) throw new Error(error.message);
      months.push(ym);
    } catch (err) {
      monthErrors.push(`${ym}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const failed = results.filter((r) => !r.ok);
  return json({
    days: results.length,
    succeeded: results.length - failed.length,
    failed,
    months,
    monthErrors,
  });
});
