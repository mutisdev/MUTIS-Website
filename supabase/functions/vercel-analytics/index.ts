import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERCEL_API = "https://api.vercel.com";
const DAY_MS = 86_400_000;

// Vercel caps a query window at 62 days.
const RANGES: Record<string, number> = { "7d": 7, "30d": 30, "60d": 60 };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

class VercelError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EVENT_PATH = new RegExp(`^/events/(${UUID})(?:/signup)?/?$`, "i");
const ARTICLE_PATH = new RegExp(`^/articles/(${UUID})/?$`, "i");

const STATIC_LABELS: Record<string, string> = {
  "/": "Home",
  "/about": "About",
  "/team": "Team",
  "/events": "Events",
  "/sponsors": "Sponsors",
  "/articles": "Articles",
  "/alumni": "Alumni",
  "/alumni/register": "Alumni registration",
  "/previous-presidents": "Previous presidents",
  "/network": "Our network",
  "/privacy": "Privacy",
  "/past-speakers": "Past speakers",
  "/attendance": "Attendance",
  "/media": "Media",
  "/gallery": "Gallery",
  "/recordings": "Recordings",
  "/join": "Join",
  "/signup": "Membership sign-up",
  "/contact": "Contact",
  "/meif": "MEIF",
  "/wif": "WIF",
  Others: "Other pages",
};

type Page = { path: string; pageviews: number; visitors: number };

// Replace UUID paths with the real event / article title so the top-pages
// list says "Sign-up: Goldman Sachs Spring Week" rather than a raw id.
async function labelPages(admin: ReturnType<typeof createClient>, pages: Page[]) {
  const eventIds = new Set<string>();
  const articleIds = new Set<string>();
  for (const p of pages) {
    const e = p.path.match(EVENT_PATH);
    if (e) eventIds.add(e[1].toLowerCase());
    const a = p.path.match(ARTICLE_PATH);
    if (a) articleIds.add(a[1].toLowerCase());
  }

  const [events, articles] = await Promise.all([
    eventIds.size
      ? admin.from("events").select("id, title").in("id", [...eventIds])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    articleIds.size
      ? admin.from("articles").select("id, title").in("id", [...articleIds])
      : Promise.resolve({ data: [] as { id: string; title: string }[] }),
  ]);
  const eventTitles = new Map((events.data ?? []).map((r) => [r.id, r.title]));
  const articleTitles = new Map((articles.data ?? []).map((r) => [r.id, r.title]));

  return pages.map((p) => {
    const e = p.path.match(EVENT_PATH);
    if (e) {
      const title = eventTitles.get(e[1].toLowerCase());
      const prefix = p.path.includes("/signup") ? "Sign-up" : "Event";
      return { ...p, label: `${prefix}: ${title ?? "Deleted event"}` };
    }
    const a = p.path.match(ARTICLE_PATH);
    if (a) return { ...p, label: `Article: ${articleTitles.get(a[1].toLowerCase()) ?? "Deleted article"}` };
    return { ...p, label: STATIC_LABELS[p.path.replace(/\/$/, "") || "/"] ?? p.path };
  });
}

// Normalises a one-dimension aggregate into {name, pageviews, visitors}.
// Empty dimension values (no referrer, untagged link) get a readable name.
function breakdown(rows: unknown, key: string, emptyLabel: string) {
  return ((rows ?? []) as Record<string, unknown>[]).map((row) => {
    const raw = row[key];
    const name = raw == null || raw === "" ? emptyLabel : raw === "Others" ? "Other" : String(raw);
    return { name, pageviews: Number(row.pageviews ?? 0), visitors: Number(row.visitors ?? 0) };
  });
}

// Sign-up page visitors (Vercel) vs sign-ups actually stored (Supabase) over
// the same window. DB counts rather than track() events: accurate, retroactive,
// and unaffected by ad-blockers dropping the analytics beacon.
async function buildConversions(admin: ReturnType<typeof createClient>, pages: Page[], sinceIso: string) {
  const eventPages = new Map<string, { pageviews: number; visitors: number }>();
  for (const p of pages) {
    const m = p.path.match(EVENT_PATH);
    if (!m || !p.path.includes("/signup")) continue;
    const id = m[1].toLowerCase();
    const prev = eventPages.get(id) ?? { pageviews: 0, visitors: 0 };
    // Trailing-slash variants of the same page are summed.
    eventPages.set(id, { pageviews: prev.pageviews + p.pageviews, visitors: prev.visitors + p.visitors });
  }
  const membershipPage = pages
    .filter((p) => p.path.replace(/\/$/, "") === "/signup")
    .reduce((acc, p) => ({ pageviews: acc.pageviews + p.pageviews, visitors: acc.visitors + p.visitors }), {
      pageviews: 0,
      visitors: 0,
    });

  // Row fetch, not a count: PostgREST caps at 1,000 rows, far above a 60-day
  // window of event sign-ups for a society this size.
  const [signups, members] = await Promise.all([
    admin.from("event_signups").select("event_id").eq("status", "confirmed").gte("created_at", sinceIso),
    admin.from("membership_signups").select("id", { count: "exact", head: true }).gte("created_at", sinceIso),
  ]);

  const signupCounts = new Map<string, number>();
  for (const row of (signups.data ?? []) as { event_id: string }[]) {
    signupCounts.set(row.event_id, (signupCounts.get(row.event_id) ?? 0) + 1);
  }

  // Every event that had either traffic or sign-ups in the window.
  const ids = new Set([...eventPages.keys(), ...signupCounts.keys()]);
  const { data: eventRows } = ids.size
    ? await admin.from("events").select("id, title, starts_at").in("id", [...ids])
    : { data: [] };
  const eventMeta = new Map(
    ((eventRows ?? []) as { id: string; title: string; starts_at: string }[]).map((e) => [e.id, e]),
  );

  const rate = (signups: number, visitors: number) => (visitors > 0 ? signups / visitors : null);

  return {
    membership: {
      ...membershipPage,
      signups: members.count ?? 0,
      rate: rate(members.count ?? 0, membershipPage.visitors),
    },
    events: [...ids]
      .map((id) => {
        const traffic = eventPages.get(id) ?? { pageviews: 0, visitors: 0 };
        const count = signupCounts.get(id) ?? 0;
        return {
          eventId: id,
          title: eventMeta.get(id)?.title ?? "Deleted event",
          startsAt: eventMeta.get(id)?.starts_at ?? null,
          ...traffic,
          signups: count,
          rate: rate(count, traffic.visitors),
        };
      })
      .sort((a, b) => b.visitors - a.visitors),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Unlike etoro-portfolio (public MEIF page), site traffic is admin-only.
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
  if (callerError || !callerData.user) return json({ error: "Invalid session" }, 401);

  const { data: callerAdminRow } = await admin
    .from("admin_users")
    .select("user_id")
    .eq("user_id", callerData.user.id)
    .maybeSingle();
  if (!callerAdminRow) return json({ error: "Only admins can do this." }, 403);

  let body: { range?: string } = {};
  try {
    body = await req.json();
  } catch {
    // Empty body is fine — default range.
  }
  const range = body.range && RANGES[body.range] ? body.range : "7d";
  const days = RANGES[range];

  const { data: settings } = await admin
    .from("vercel_analytics_settings")
    .select("project_id, team_id, is_configured")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.is_configured || !settings.project_id) return json({ configured: false });

  const { data: token } = await admin.rpc("etoro_get_secret", { secret_name: "vercel_analytics_token" });
  if (!token) return json({ configured: false });

  const query = async (path: string, extra: Record<string, string>) => {
    const params = new URLSearchParams({ projectId: settings.project_id!, ...extra });
    if (settings.team_id) params.set("teamId", settings.team_id);
    const res = await fetch(`${VERCEL_API}/v1/query/web-analytics/${path}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new VercelError(res.status, `Vercel ${path} returned ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
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

  const now = Date.now();
  const until = String(now);
  const since = String(now - days * DAY_MS);
  const weekSince = String(now - 7 * DAY_MS);

  try {
    // Secondary breakdowns resolve to null on failure (e.g. a dimension the
    // Vercel plan doesn't include — UTM needs Web Analytics Plus) so one
    // refused query can't blank the core traffic chart.
    const breakdownErrors: Record<string, string> = {};
    const optional = (name: string, p: Promise<unknown>) =>
      p.catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Optional Vercel breakdown '${name}' failed`, message);
        breakdownErrors[name] = message;
        return null;
      });

    const [totals, week, timeseries, paths, referrers, devices, countries] = await Promise.all([
      rangeTotals(since, until),
      rangeTotals(weekSince, until),
      query("visits/aggregate", { since, until, by: "day" }),
      // requestPath, not route: this is a Vite SPA without the Analytics
      // `route` prop, so Vercel has no [param] patterns to roll up. Max limit so
      // every event sign-up page is present for the conversion table too.
      query("visits/aggregate", { since, until, by: "requestPath", limit: "100" }),
      optional("referrers", query("visits/aggregate", { since, until, by: "referrerHostname", limit: "8" })),
      optional("devices", query("visits/aggregate", { since, until, by: "deviceType", limit: "5" })),
      optional("countries", query("visits/aggregate", { since, until, by: "country", limit: "8" })),
    ]);

    const allPages: Page[] = ((paths ?? []) as Record<string, unknown>[])
      .map((row) => ({
        path: String(row.requestPath ?? "Others"),
        pageviews: Number(row.pageviews ?? 0),
        visitors: Number(row.visitors ?? 0),
      }))
      .filter((p) => !p.path.startsWith("/admin"))
      .sort((a, b) => b.pageviews - a.pageviews);
    const labelled = await labelPages(admin, allPages.filter((p) => p.path !== "Others").slice(0, 10));
    const conversions = await buildConversions(admin, allPages, new Date(Number(since)).toISOString());

    return json({
      configured: true,
      range,
      totals: { pageviews: totals?.pageviews ?? 0, visitors: totals?.visitors ?? 0 },
      weekVisitors: week?.visitors ?? 0,
      timeseries: (timeseries ?? []).map((row: Record<string, unknown>) => ({
        timestamp: row.timestamp,
        pageviews: row.pageviews ?? 0,
        visitors: row.visitors ?? 0,
      })),
      topPages: labelled,
      referrers: referrers && breakdown(referrers, "referrerHostname", "Direct / none"),
      devices: devices && breakdown(devices, "deviceType", "Unknown"),
      countries: countries && breakdown(countries, "country", "Unknown"),
      breakdownErrors,
      conversions,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error contacting Vercel";
    console.error("Vercel analytics fetch failed", message);
    // 200 so supabase.functions.invoke surfaces `data.error` (it drops the
    // body on non-2xx); upstreamStatus lets the UI tell auth failures apart.
    return json({ configured: true, error: message, upstreamStatus: err instanceof VercelError ? err.status : null });
  }
});
