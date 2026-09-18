import { supabase } from "@/lib/supabase";

// Mirrors the labelling in supabase/functions/vercel-analytics so snapshot
// page paths (stored raw) read the same as the live top-pages list.

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
  "/attendance": "Event feedback",
  "/media": "Media",
  "/gallery": "Gallery",
  "/recordings": "Recordings",
  "/join": "Join",
  "/signup": "Membership sign-up",
  "/contact": "Contact",
  "/meif": "MEIF",
  "/wif": "WIF",
};

/** Resolve raw request paths to readable labels (event / article titles looked up by id). */
export async function labelPaths(paths: string[]): Promise<Map<string, string>> {
  const eventIds = new Set<string>();
  const articleIds = new Set<string>();
  for (const p of paths) {
    const e = p.match(EVENT_PATH);
    if (e) eventIds.add(e[1].toLowerCase());
    const a = p.match(ARTICLE_PATH);
    if (a) articleIds.add(a[1].toLowerCase());
  }

  const [events, articles] = await Promise.all([
    eventIds.size ? supabase.from("events").select("id, title").in("id", [...eventIds]) : Promise.resolve({ data: [] }),
    articleIds.size ? supabase.from("articles").select("id, title").in("id", [...articleIds]) : Promise.resolve({ data: [] }),
  ]);
  const eventTitles = new Map((events.data ?? []).map((r) => [r.id, r.title]));
  const articleTitles = new Map((articles.data ?? []).map((r) => [r.id, r.title]));

  return new Map(
    paths.map((p) => {
      const e = p.match(EVENT_PATH);
      if (e) {
        const prefix = p.includes("/signup") ? "Sign-up" : "Event";
        return [p, `${prefix}: ${eventTitles.get(e[1].toLowerCase()) ?? "Deleted event"}`];
      }
      const a = p.match(ARTICLE_PATH);
      if (a) return [p, `Article: ${articleTitles.get(a[1].toLowerCase()) ?? "Deleted article"}`];
      return [p, STATIC_LABELS[p.replace(/\/$/, "") || "/"] ?? p];
    }),
  );
}
