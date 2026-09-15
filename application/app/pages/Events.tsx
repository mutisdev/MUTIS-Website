import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Helmet } from "react-helmet-async";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { SITE_URL } from "@/app/hooks/usePageMeta";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

// `summary` shows on the collapsed card; `full` and `details` are revealed on
// expand. PENDING: fuller write-ups (format, past partners, how to take part)
// from the committee — only facts already published on the site are used here.
const FLAGSHIP = [
  {
    num: "E.01",
    title: "Women in Finance Conference",
    term: "Autumn Term",
    summary: "Senior women from across finance, on campus for a day.",
    full: "A flagship day bringing senior women from across investment banking, asset management, and markets onto campus.",
    details: [["Format", "Conference"], ["Sectors", "Investment banking · Asset management · Markets"]],
    foot: "Manchester",
  },
  {
    num: "E.02",
    title: "UK Student Finance Summit",
    term: "Spring Term",
    summary: "The UK's largest cross-university finance student gathering.",
    full: "The largest cross-university gathering of finance students in the UK, hosted by MUTIS in partnership with leading firms.",
    details: [["Format", "Summit"], ["Open to", "Finance students from universities across the UK"]],
    foot: "Manchester",
  },
  {
    num: "E.03",
    title: "M&A Challenge",
    term: "Year-round",
    summary: "A year-long live deal simulation, judged by bankers.",
    full: "A live deal simulation run across the year, judged by working bankers from sponsor firms.",
    details: [["Format", "Live deal simulation"], ["Judged by", "Working bankers from sponsor firms"]],
    foot: "Manchester",
  },
  {
    num: "E.04",
    title: "The Shade Tree",
    term: "Spring Term",
    summary: "A 25-year student-run investment initiative with Alliance MBS.",
    full: "A 25-year, student-run investment initiative run annually with Alliance Manchester Business School, where MUTIS teams pitch real long-term investment theses for capital donated by alumni Adam and Sara Franks.",
    details: [["Format", "Investment pitch"], ["Partner", "Alliance Manchester Business School"]],
    foot: "Manchester",
  },
];

function FlagshipCard({ event }: { event: (typeof FLAGSHIP)[number] }) {
  const [open, setOpen] = useState(false);
  const panelId = `flagship-${event.num}`;
  const toggle = () => setOpen((v) => !v);

  // The whole card toggles on click for convenience; the button in the
  // footer is the accessible control (keyboard + screen readers).
  // Open state lives in data-open, not className: useReveal adds the "in"
  // class to .r-up elements directly, and a React className change would
  // wipe it and hide the card again.
  return (
    <div className="dark-card flagship-card r-up" data-open={open} onClick={toggle}>
      <div className="num">{event.num}</div>
      <h3>{event.title}</h3>
      <div className="meta">{event.term}</div>
      <p>{event.summary}</p>
      <div className="flagship-more" id={panelId} aria-hidden={!open}>
        <div>
          <p>{event.full}</p>
          <dl className="flagship-details">
            {event.details.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="foot">
        <span>{event.foot}</span>
        <button
          type="button"
          className="more"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
        >
          {open ? "Show less ↑" : "Read more ↓"}
        </button>
      </div>
    </div>
  );
}

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

      // Hide events once they've ended — a read-time filter, not a cron job.
      // Events with an ends_at stay visible until that passes; events without
      // one (ends_at is optional) fall back to 24h after their scheduled
      // start. Always sorted chronologically; there's no user-facing sort control.
      const now = new Date().toISOString();
      const graceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("is_published", true)
        .or(`and(ends_at.is.null,starts_at.gt.${graceCutoff}),ends_at.gt.${now}`)
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

  useReveal([FLAGSHIP.length, events.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("events");

  // Event JSON-LD, built live from the same Supabase query above — not
  // hardcoded. Each event now has its own page at /events/:id/signup, so
  // `url` points there instead of the listing page.
  const eventsJsonLd =
    events.length > 0
      ? {
          "@context": "https://schema.org",
          "@graph": events.map((ev) => ({
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
          <div className="page-eyebrow r-up"><span className="bar" />Flagship</div>
          <h2 className="r-up">Four events define the year</h2>
          <div className="card-grid flagship-grid">
            {FLAGSHIP.map((e) => (
              <FlagshipCard key={e.num} event={e} />
            ))}
          </div>
        </div>
      </section>

      <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Upcoming</div>
          <h2 className="r-up">Upcoming events</h2>
          {isLoading ? (
            <p className="lede r-up" role="status">Loading upcoming events…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : events.length === 0 ? (
            <p className="lede r-up">Nothing scheduled yet. Check back soon.</p>
          ) : (
            <div className="card-grid">
              {events.map((ev) => (
                <div className="dark-card r-up" key={ev.id}>
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
                    <span>{ev.signup_enabled ? "Signup open" : "Details"}</span>
                    <Link to={`/events/${ev.id}/signup`} className="more" style={{ textDecoration: "none" }}>View details →</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Past Events</div>
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
