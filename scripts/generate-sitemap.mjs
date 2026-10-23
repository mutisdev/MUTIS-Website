// Generates public/sitemap.xml before every build: the static public routes
// plus one <url> per published article, pulled live from Supabase so new
// articles show up without a manual sitemap edit.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://www.mutisfinancesociety.com";
const OUTPUT_PATH = fileURLToPath(new URL("../public/sitemap.xml", import.meta.url));

// Static public routes. Keep in sync with the public route list in
// application/app/routes.tsx. Deliberately excludes: /admin/* (noindex),
// /alumni (a client-side redirect stub, not a real page),
// /attendance (an unlisted, QR-code-only utility page with no SEO value), and
// /alumni/register (reached only via the CTA on /network, same reasoning).
const STATIC_ROUTES = [
  { path: "/", changefreq: "weekly", priority: "1.0" },
  { path: "/about", changefreq: "monthly", priority: "0.8" },
  { path: "/team", changefreq: "monthly", priority: "0.7" },
  { path: "/events", changefreq: "weekly", priority: "0.8" },
  { path: "/opportunities", changefreq: "weekly", priority: "0.8" },
  { path: "/meif", changefreq: "monthly", priority: "0.8" },
  { path: "/wif", changefreq: "monthly", priority: "0.7" },
  { path: "/articles", changefreq: "weekly", priority: "0.7" },
  { path: "/sponsors", changefreq: "monthly", priority: "0.7" },
  { path: "/previous-presidents", changefreq: "yearly", priority: "0.5" },
  { path: "/network", changefreq: "monthly", priority: "0.6" },
  { path: "/past-speakers", changefreq: "monthly", priority: "0.5" },
  { path: "/media", changefreq: "monthly", priority: "0.6" },
  { path: "/gallery", changefreq: "monthly", priority: "0.5" },
  { path: "/recordings", changefreq: "monthly", priority: "0.6" },
  { path: "/join", changefreq: "monthly", priority: "0.9" },
  { path: "/contact", changefreq: "yearly", priority: "0.6" },
  { path: "/privacy", changefreq: "yearly", priority: "0.3" },
];

function urlEntry(loc, { changefreq, priority, lastmod }) {
  const lastmodTag = lastmod ? `<lastmod>${lastmod}</lastmod>` : "";
  return `  <url><loc>${loc}</loc>${lastmodTag}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

/** The anon client, or null when the build has no Supabase credentials — in
 * which case the sitemap is still written, just with static routes only. */
function client() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/rest\/v1\/?$/, "");
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn(
      "[generate-sitemap] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY not set — " +
        "skipping dynamic URLs, sitemap will only contain static routes.",
    );
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

async function fetchPublishedArticles() {
  const supabase = client();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("articles")
    .select("id, updated_at")
    .eq("status", "published");

  if (error) {
    console.warn("[generate-sitemap] Failed to fetch published articles:", error.message);
    return [];
  }

  return data ?? [];
}

async function fetchPublishedPositions() {
  const supabase = client();
  if (!supabase) return [];

  // Only published listings, and only ones still open: a closed round stays on
  // the page for reference but shouldn't be advertised as a live posting.
  const { data, error } = await supabase
    .from("positions")
    .select("id, updated_at, closes_at, applications_open")
    .eq("is_published", true);

  if (error) {
    console.warn("[generate-sitemap] Failed to fetch positions:", error.message);
    return [];
  }

  const now = Date.now();
  return (data ?? []).filter(
    (row) => row.applications_open && (!row.closes_at || new Date(row.closes_at).getTime() > now),
  );
}

async function main() {
  const [articles, positions] = await Promise.all([fetchPublishedArticles(), fetchPublishedPositions()]);

  const staticEntries = STATIC_ROUTES.map((route) =>
    urlEntry(`${SITE_URL}${route.path}`, route),
  );

  const articleEntries = articles.map((article) =>
    urlEntry(`${SITE_URL}/articles/${article.id}`, {
      changefreq: "monthly",
      priority: "0.6",
      lastmod: article.updated_at ? article.updated_at.slice(0, 10) : undefined,
    }),
  );

  const positionEntries = positions.map((position) =>
    urlEntry(`${SITE_URL}/opportunities/${position.id}`, {
      changefreq: "weekly",
      priority: "0.7",
      lastmod: position.updated_at ? position.updated_at.slice(0, 10) : undefined,
    }),
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...articleEntries, ...positionEntries].join("\n")}
</urlset>
`;

  writeFileSync(OUTPUT_PATH, xml, "utf-8");
  console.log(
    `[generate-sitemap] Wrote ${staticEntries.length} static + ${articleEntries.length} article + ${positionEntries.length} opportunity URLs to public/sitemap.xml`,
  );
}

await main();
