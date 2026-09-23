import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Helmet } from "react-helmet-async";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { SITE_URL } from "@/app/hooks/usePageMeta";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { eventEndTime, hasEventEnded } from "@shared/eventStatus";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const eventImageModules = import.meta.glob(
  "../../assets/events/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}",
  { eager: true, import: "default" },
) as Record<string, string>;

// Curated "past examples" — drop images from Instagram (@mutisfinancesoc) and
// other channels into application/assets/events/, then caption them here by
// filename. Uncaptioned images still show, just without a caption.
const PAST_EVENT_CAPTIONS: Record<string, string> = {};
const PAST_EVENT_EXAMPLE_COUNT = 8;

const PAST_EVENT_EXAMPLES = Object.entries(eventImageModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, src]) => {
    const file = path.split("/").pop() ?? path;
    return { file, src, caption: PAST_EVENT_CAPTIONS[file] };
  })
  .slice(0, PAST_EVENT_EXAMPLE_COUNT);

type EventRow = Tables<"events">;

const formatEventDate = (isoString: string) =>
  new Date(isoString).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function Events() {
  const { settings } = useSiteSettings();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadEvents = async () => {
      setIsLoading(true);
      setLoadError("");

      // All published events; they're split into upcoming and past at render
      // time (see hasEventEnded), so ended events move to "Past events" as
      // soon as they finish — no cron job.
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_published", true)
        .order("starts_at", { ascending: true });

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Failed to load events", error);
        setLoadError("We could not load upcoming events right now. Please refresh the page.");
        setEvents([]);
        setIsLoading(false);
        return;
      }

      setEvents(data ?? []);
      setIsLoading(false);
    };

    void loadEvents();

    return () => {
      cancelled = true;
    };
  }, []);

  const now = Date.now();
  const upcomingEvents = events.filter((ev) => !hasEventEnded(ev, now));
  // Most recent first.
  const pastEvents = events
    .filter((ev) => hasEventEnded(ev, now))
    .sort((a, b) => eventEndTime(b) - eventEndTime(a));

  useReveal([events.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("events");

  // Event JSON-LD, built live from the same Supabase query above — not
  // hardcoded. Each event now has its own page at /events/:id/signup, so
  // `url` points there instead of the listing page.
  const eventsJsonLd =
    upcomingEvents.length > 0
      ? {
          "@context": "https://schema.org",
          "@graph": upcomingEvents.map((ev) => ({
            "@type": "Event",
            name: ev.title,
            startDate: ev.starts_at,
            endDate: ev.ends_at ?? undefined,
            eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
            location: {
              "@type": "Place",
              name: ev.location,
            },
            description: htmlToExcerpt(ev.description, 300),
            image: ev.cover_image_url ?? undefined,
            url: `${SITE_URL}/events/${ev.id}/signup`,
          })),
        }
      : null;

  return (
    <>
      {eventsJsonLd && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(eventsJsonLd)}</script>
        </Helmet>
      )}
      <section className="page-hero page-hero-events" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb"><Link to="/">MUTIS</Link><span>/</span><span>Events</span></div>
            <h1 className="page-title r-up"><span className="accent">Events</span></h1>
          </div>
          <p className="page-sub r-up">Put yourself in the room with the people hiring.</p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Upcoming</div>
          <h2 className="r-up">Upcoming events</h2>
          {isLoading ? (
            <p className="lede r-up" role="status">Loading upcoming events…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : upcomingEvents.length === 0 ? (
            <p className="lede r-up">Nothing scheduled yet. Check back soon.</p>
          ) : (
            <div className="card-grid">
              {upcomingEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Past Events</div>
          {pastEvents.length > 0 && (
            <>
              <h2 className="r-up">Past events</h2>
              <div className="card-grid" style={{ marginBottom: 64 }}>
                {pastEvents.map((ev) => (
                  <EventCard key={ev.id} event={ev} past />
                ))}
              </div>
            </>
          )}
          <h2 className="r-up">Past examples of events</h2>
          <div className="event-examples r-up">
            {PAST_EVENT_EXAMPLES.map((img) => (
              <figure className="event-example" key={img.file}>
                <div className="gallery-item">
                  <img
                    src={img.src}
                    alt={img.caption ?? "MUTIS event photo"}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
                {img.caption && <figcaption>{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
          <div className="r-up" style={{ marginTop: 32, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Link to="/gallery" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              Full gallery <span className="arrow" />
            </Link>
            <a href={settings.instagram_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              More on Instagram <span className="arrow" />
            </a>
            <Link to="/past-speakers" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              Past speakers <span className="arrow" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function EventCard({ event: ev, past = false }: { event: EventRow; past?: boolean }) {
  return (
    <div className="dark-card r-up">
      {ev.cover_image_url && (
        <img
          src={ev.cover_image_url}
          alt={ev.title}
          className="event-thumb"
          loading="lazy"
          decoding="async"
        />
      )}
      <h3>{ev.title}</h3>
      <div className="meta"><span>{formatEventDate(ev.starts_at)}</span><span>·</span><span>{ev.location}</span></div>
      {ev.tags.length > 0 && (
        <div className="tag-list">
          {ev.tags.map((tag) => (
            <span key={tag} className="tag-badge">{tag}</span>
          ))}
        </div>
      )}
      <p className="excerpt">{htmlToExcerpt(ev.description)}</p>
      <div className="foot">
        <span>{past ? "Event ended" : ev.signup_enabled ? "Signup open" : "Details"}</span>
        <Link to={`/events/${ev.id}/signup`} className="more" style={{ textDecoration: "none" }}>View details →</Link>
      </div>
    </div>
  );
}
