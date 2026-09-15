import { useEffect, useState } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type EventRow = Tables<"events">;

const DISMISS_KEY = "mutis:dismissed-event-banner";

const formatEventDate = (isoString: string) =>
  new Date(isoString).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function UpcomingEventBanner() {
  const [event, setEvent] = useState<EventRow | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("events")
      .select("*")
      .eq("is_published", true)
      .gt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true })
      .limit(1)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("Failed to load upcoming event for banner", error);
          return;
        }
        const next = data?.[0] ?? null;
        setEvent(next);
        if (next && sessionStorage.getItem(DISMISS_KEY) === next.id) {
          setDismissed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!event || dismissed) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, event.id);
    setDismissed(true);
  };

  return (
    <div className="pm-event-banner" role="complementary" aria-label="Upcoming event">
      <div className="pm-event-banner-body">
        <p className="pm-event-banner-text">
          <span className="pm-event-banner-eyebrow">Next up</span>
          {event.title} — {formatEventDate(event.starts_at)}
        </p>
        <Link to="/events" className="pm-event-banner-cta" style={{ textDecoration: "none" }}>
          Sign up to our latest event →
        </Link>
      </div>
      <button type="button" className="pm-event-banner-close" onClick={dismiss} aria-label="Dismiss">
        <X style={{ width: 14, height: 14 }} aria-hidden="true" />
      </button>
    </div>
  );
}
