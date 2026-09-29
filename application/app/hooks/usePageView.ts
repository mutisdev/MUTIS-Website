import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

/** localStorage key holding this browser's random visit id. */
const SESSION_KEY = "mutis:page-view-session";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Paths already logged this page load. Module level rather than a ref so it also
 * covers React StrictMode's double-invoked effect and any remount from a route
 * change. page_views has no unique key, and the visitor metric counts distinct
 * session ids, so a duplicate row wouldn't skew anything — this just avoids the
 * wasted request.
 */
const logged = new Set<string>();

/** Used when localStorage is unavailable: lasts for this tab only. */
let memorySessionId: string | null = null;

function sessionId(): string | null {
  if (typeof window === "undefined") return null;
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") return null;
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing !== null && UUID_RE.test(existing)) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    // Safari private mode, "block all cookies", and some in-app browsers throw
    // on read or write. Fall back to a per-tab id: a returning visitor in that
    // state is counted more than once, which understates the response rate
    // rather than flattering it.
    memorySessionId ??= crypto.randomUUID();
    return memorySessionId;
  }
}

/**
 * Records one anonymous visit to `path`, for the admin feedback summary.
 *
 * Nothing identifying is sent: no IP address, user agent or referrer, and the
 * only identifier is a random UUID this browser keeps in localStorage. The
 * server stores the hour (UK time) rather than the exact moment, so a visit
 * can't be matched to the moment someone filled a form in.
 *
 * Fire-and-forget by design: it never gates rendering, never surfaces an error
 * to the visitor and never blocks a form.
 */
export function usePageView(path: string): void {
  useEffect(() => {
    if (logged.has(path)) return;
    logged.add(path);

    const id = sessionId();
    if (id === null) return;

    void supabase
      .from("page_views")
      .insert({ session_id: id, path })
      .then(({ error }) => {
        if (error) {
          // Don't suppress the count permanently — a later mount can retry.
          logged.delete(path);
          console.error("Failed to log page view", error);
        }
      });
  }, [path]);
}
