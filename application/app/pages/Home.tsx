import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link } from "react-router";
import { useTilt } from "../hooks/useTilt";
import { useSiteSettings } from "../hooks/useSiteSettings";
import { UpcomingEventBanner } from "../components/UpcomingEventBanner";
import { htmlToExcerpt } from "../lib/htmlExcerpt";
import { FreshersFairBanner } from "../components/FreshersFairBanner";
import { usePageBackgroundImage } from "../hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type SponsorRow = Tables<"sponsors">;
type EventRow = Tables<"events">;

// ---- Utilities ----

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Scroll-triggered reveal is disabled on the home page by request: content is
// shown immediately with no scroll animation. The ref is kept for compatibility.
function useInView<T extends HTMLElement = HTMLElement>(
  _opts: { threshold?: number; once?: boolean } = {}
) {
  const ref = useRef<T | null>(null);
  return [ref, true] as const;
}

// ---- Tilt wrapper ----

type TiltProps = {
  as?: "div" | "a" | "button";
  to?: string;
  href?: string;
  intensity?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
};

function Tilt({ as = "div", to, href, intensity = 8, className = "", style, children, ...rest }: TiltProps) {
  const tilt = useTilt(intensity);
  const combined = "tilt " + className;
  if (to) {
    return (
      <Link to={to} ref={tilt.ref as React.Ref<HTMLAnchorElement>}
        onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}
        className={combined} style={style} {...rest}>{children}</Link>
    );
  }
  if (as === "a") {
    return (
      <a href={href} ref={tilt.ref as React.Ref<HTMLAnchorElement>}
        onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}
        className={combined} style={style} {...rest}>{children}</a>
    );
  }
  if (as === "button") {
    return (
      <button ref={tilt.ref as React.Ref<HTMLButtonElement>}
        onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}
        className={combined} style={style} {...rest}>{children}</button>
    );
  }
  return (
    <div ref={tilt.ref as React.Ref<HTMLDivElement>}
      onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave}
      className={combined} style={style} {...rest}>{children}</div>
  );
}

// ---- Hero ----

function Hero() {
  // Scroll/intro animation removed by request — hero renders fully static.
  const intro = 1;
  const fgOpacity = 1;
  const { settings } = useSiteSettings();
  const bgImage = usePageBackgroundImage("home");

  return (
    <section className="pm-hero">
      {/* Background image (static, no parallax) */}
      <div
        className="pm-hero-bg"
        style={{ transform: "scale(1.1)", ...(bgImage ? { backgroundImage: `url(${bgImage})` } : {}) }}
      />
      <div className="pm-hero-overlay" />
      <div className="pm-hero-grain" aria-hidden="true" />

      {/* Main content */}
      <div className="pm-hero-content" style={{ opacity: fgOpacity }}>
        <div
          className="pm-hero-eyebrow"
          style={{ opacity: clamp(intro * 1.6 - 0.2), transform: `translateY(${(1 - clamp(intro * 1.6 - 0.2)) * 14}px)` }}
        >
          University of Manchester &nbsp;·&nbsp; Est. {settings.founding_year}
        </div>

        <h1 className="pm-hero-masthead">
          {["MUTIS"].map((word, i) => (
            <span className="pm-hero-title-line" key={i}>
              <span style={{
                display: "inline-block",
                transform: `translateY(${intro < 0.01 ? "105%" : "0%"})`,
                transition: `transform 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.08}s`,
              }}>
                {word}
              </span>
            </span>
          ))}
          <div
            className="pm-hero-rule"
            style={{ transform: `scaleX(${intro})`, transformOrigin: "left", opacity: clamp(intro * 2 - 0.8) }}
          />
          <div
            className="pm-hero-subtitle"
            style={{
              opacity: clamp(intro * 1.5 - 0.5),
              transform: `translateY(${(1 - clamp(intro * 1.5 - 0.5)) * 12}px)`,
            }}
          >
            Finance Society
          </div>
        </h1>

        <p
          className="pm-hero-body"
          style={{
            opacity: clamp(intro * 1.4 - 0.6),
            transform: `translateY(${(1 - clamp(intro * 1.4 - 0.6)) * 14}px)`,
          }}
        >
          Real research, live capital, and direct industry access for Manchester students. {settings.member_count_label} members across every faculty.
        </p>

        <div
          className="pm-hero-actions"
          style={{
            opacity: clamp(intro * 1.6 - 0.8),
            transform: `translateY(${(1 - clamp(intro * 1.6 - 0.8)) * 12}px)`,
          }}
        >
          <Tilt to="/join" className="pm-btn pm-btn--primary" intensity={8} style={{ textDecoration: "none" }}>
            Join MUTIS
            <span className="pm-btn-arrow" />
          </Tilt>
          <Tilt to="/events" className="pm-btn pm-btn--ghost" intensity={8} style={{ textDecoration: "none" }}>
            Events
            <span className="pm-btn-arrow" />
          </Tilt>
        </div>
      </div>

      {/* Right-side stat panel */}
      <div
        className="pm-hero-stats"
        style={{ opacity: clamp(intro * 2 - 1) * fgOpacity }}
      >
        {[
          { val: settings.member_count_label, label: "Members" },
          { val: "17", label: "Industry Partners" },
          { val: "5+", label: "Flagship Events" },
        ].map((s, i) => (
          <div className="pm-hero-stat" key={i}>
            <div className="pm-hero-stat-val">{s.val}</div>
            <div className="pm-hero-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

    </section>
  );
}

// ---- Stats strip ----

function StatsStrip() {
  const [ref, inView] = useInView<HTMLElement>({ threshold: 0.4 });
  const { settings } = useSiteSettings();
  const stripStats = [
    { val: settings.member_count_label, label: "Members" },
    { val: "17", label: "Industry Partners" },
    { val: "5+", label: "Flagship Events" },
    { val: "6", label: "Sector Teams" },
  ];
  return (
    <section className="pm-stats-strip" ref={ref}>
      <div className="pm-stats-inner">
        {stripStats.map((s, i) => (
          <div
            className="pm-stat"
            key={s.label}
            style={{
              opacity: inView ? 1 : 0,
              transform: `translateY(${inView ? "0px" : "16px"})`,
              transition: `opacity 0.7s ease ${i * 0.1}s, transform 0.7s ease ${i * 0.1}s`,
            }}
          >
            <div className="pm-stat-val">{s.val}</div>
            <div className="pm-stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Next & Upcoming Events ----

const formatUpcomingDate = (isoString: string) =>
  new Date(isoString).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

function UpcomingEvents() {
  const [ref, inView] = useInView<HTMLElement>({ threshold: 0.15 });
  const t = inView ? 1 : 0;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    // Same read-time expiry rule as the Events page: visible until ends_at,
    // or 24h after starts_at when no end time is set.
    const now = new Date().toISOString();
    const graceCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    supabase
      .from("events")
      .select("*")
      .eq("is_published", true)
      .or(`and(ends_at.is.null,starts_at.gt.${graceCutoff}),ends_at.gt.${now}`)
      .order("starts_at", { ascending: true })
      .limit(4)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load upcoming events", error);
        setEvents(data ?? []);
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="pm-about" ref={ref}>
      <div className="pm-about-inner">
        <div className="pm-about-left">
          <div
            className="pm-eyebrow"
            style={{ opacity: t, transform: `translateY(${(1 - t) * 14}px)`, transition: "opacity 0.7s ease, transform 0.7s ease" }}
          >
            Next &amp; Upcoming
          </div>
          <h2 className="pm-about-heading">
            {["What's", "Coming", "Up"].map((line, i) => (
              <span className="pm-reveal-line" key={i}>
                <span style={{
                  display: "inline-block",
                  color: i === 2 ? "var(--pm-accent)" : "#021967",
                  transform: `translateY(${t ? "0%" : "108%"})`,
                  transition: `transform 1s cubic-bezier(.22,1,.36,1) ${i * 0.12}s`,
                }}>
                  {line}
                </span>
              </span>
            ))}
          </h2>
          <p
            className="pm-about-lede"
            style={{ opacity: t, transform: `translateY(${t ? "0px" : "20px"})`, transition: "opacity 0.9s ease 0.3s, transform 0.9s ease 0.3s" }}
          >
            Our next events. Sign up on the Events page.
          </p>
        </div>

        <div className="pm-programs">
          {isLoading ? null : events.length === 0 ? (
            <div className="pm-program">
              <div className="pm-program-num">—</div>
              <div className="pm-program-body">
                <div className="pm-program-title">Nothing scheduled yet</div>
                <div className="pm-program-desc">
                  New dates are announced on the <Link to="/events" className="pm-upcoming-link">Events page</Link>.
                </div>
              </div>
            </div>
          ) : (
            events.map((ev, i) => (
              <Link
                to="/events"
                className="pm-program pm-upcoming"
                key={ev.id}
                style={{
                  textDecoration: "none",
                  opacity: t,
                  transform: `translateY(${t ? "0px" : "24px"})`,
                  transition: `opacity 0.8s ease ${0.3 + i * 0.1}s, transform 0.8s cubic-bezier(.22,1,.36,1) ${0.3 + i * 0.1}s`,
                }}
              >
                <div className="pm-program-num">{String(i + 1).padStart(2, "0")}</div>
                <div className="pm-program-body">
                  <div className="pm-upcoming-date">{formatUpcomingDate(ev.starts_at)}</div>
                  <div className="pm-program-title">{ev.title}</div>
                  <div className="pm-program-desc">{htmlToExcerpt(ev.description, 110)}</div>
                </div>
              </Link>
            ))
          )}
          <Link to="/events" className="pm-upcoming-all" style={{ textDecoration: "none" }}>
            All events →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---- Events ----

const EVENTS = [
  {
    id: "E.01",
    term: "Autumn Term",
    title: "Women in Finance Conference",
    desc: "A flagship day bringing senior women from across investment banking, asset management, and markets onto campus.",
    location: "Manchester · Hybrid",
  },
  {
    id: "E.02",
    term: "Spring Term",
    title: "UK Student Finance Summit",
    desc: "The largest cross-university gathering of finance students in the UK, hosted by MUTIS in partnership with leading firms.",
    location: "Alliance MBS",
  },
  {
    id: "E.03",
    term: "Year-round",
    title: "M&A Challenge",
    desc: "A live deal simulation run across the year, judged by working bankers from our partner firms.",
    location: "Manchester",
  },
  {
    id: "E.04",
    term: "Spring Term",
    title: "The Shade Tree",
    desc: "A 25-year, student-run investment initiative run annually with Alliance Manchester Business School, where MUTIS teams pitch real long-term investment theses for capital donated by alumni Adam and Sara Franks.",
    location: "Alliance MBS",
  },
];

function EventsSection() {
  const [ref, inView] = useInView<HTMLElement>({ threshold: 0.1 });
  const t = inView ? 1 : 0;

  return (
    <section className="pm-events" ref={ref}>
      <div className="pm-events-inner">
        <div className="pm-events-head">
          <h2>
            {["Events"].map((w, i) => (
              <span className="pm-reveal-line" key={i}>
                <span style={{
                  display: "inline-block",
                  transform: `translateY(${t ? "0%" : "108%"})`,
                  transition: `transform 1s cubic-bezier(.22,1,.36,1) ${i * 0.12}s`,
                }}>
                  {w}
                </span>
              </span>
            ))}
          </h2>
          <p style={{ opacity: t, transition: "opacity 0.9s ease 0.35s" }}>
            Four events define the MUTIS year.
          </p>
        </div>

        <div className="pm-events-grid">
          {EVENTS.map((ev, i) => (
            <EventCard key={ev.id} ev={ev} index={i} inView={t} />
          ))}
        </div>

        <div
          className="pm-events-foot"
          style={{ opacity: t, transform: `translateY(${t ? "0px" : "16px"})`, transition: "opacity 0.9s ease 0.7s, transform 0.9s ease 0.7s" }}
        >
          <Tilt to="/events" className="pm-btn pm-btn--ghost" intensity={7} style={{ textDecoration: "none" }}>
            All Events
            <span className="pm-btn-arrow" />
          </Tilt>
        </div>
      </div>
    </section>
  );
}

function EventCard({ ev, index, inView }: { ev: typeof EVENTS[0]; index: number; inView: number }) {
  const tilt = useTilt(8);
  const delay = 0.3 + index * 0.18;
  return (
    <div
      style={{
        opacity: inView,
        transform: `translateY(${inView ? "0px" : "60px"})`,
        transition: `opacity 1.2s ease ${delay}s, transform 1.2s cubic-bezier(.22,1,.36,1) ${delay}s`,
      }}
    >
      <div
        className="pm-event-card tilt"
        ref={tilt.ref as React.Ref<HTMLDivElement>}
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
      >
        <div className="pm-event-top">
          <span className="pm-event-term">{ev.term}</span>
          <span className="pm-event-id">{ev.id}</span>
        </div>
        <div className="pm-event-body">
          <h3 className="pm-event-title">{ev.title}</h3>
          <p className="pm-event-desc">{ev.desc}</p>
        </div>
        <div className="pm-event-foot">
          <span className="pm-event-location">{ev.location}</span>
          <Link to="/events" className="pm-event-more" style={{ textDecoration: "none" }}>
            Details →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---- Sponsors Strip ----

function SponsorsStrip() {
  const [logos, setLogos] = useState<SponsorRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("sponsors")
      .select("*")
      .eq("is_published", true)
      .neq("tier", "past")
      .order("display_order")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load sponsor logos", error);
        setLogos((data ?? []).filter((s) => s.logo_url));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (logos.length === 0) return null;

  return (
    <div className="pm-sponsors">
      <div className="pm-sponsors-label">Our Partners &amp; Sponsors</div>
      <div className="pm-sponsors-track-wrap" aria-label="Partner and sponsor logos">
        <div className="pm-sponsors-track">
          {[...logos, ...logos].map((firm, i) => {
            const isDupe = i >= logos.length;
            return (
              <a
                key={firm.id + i}
                href={firm.link_url ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="pm-sponsor-logo-wrap"
                aria-label={isDupe ? undefined : `${firm.name} careers`}
                aria-hidden={isDupe || undefined}
                tabIndex={isDupe ? -1 : undefined}
              >
                <img
                  src={firm.logo_url ?? undefined}
                  alt={isDupe ? "" : firm.name}
                  className="pm-sponsor-logo"
                  loading="lazy"
                  decoding="async"
                />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---- Final CTA ----

function FinalCTA() {
  const [ref, inView] = useInView<HTMLElement>({ threshold: 0.25 });
  const t = inView ? 1 : 0;

  return (
    <section className="pm-cta" ref={ref}>
      <div
        className="pm-cta-eyebrow"
        style={{ opacity: t, transform: `translateY(${(1 - t) * 16}px)`, transition: "opacity 0.7s ease, transform 0.7s ease" }}
      >
        Your move
      </div>
      <h2 className="pm-cta-heading">
        {[["Build your", ""], ["finance", "accent"], ["career", "stroke"], ["with MUTIS", ""]].map(([word, cls], i) => (
          <span className="pm-reveal-line" key={i}>
            <span
              className={cls === "accent" ? "pm-cta-accent" : cls === "stroke" ? "pm-cta-stroke" : ""}
              style={{
                display: "inline-block",
                transform: `translateY(${t ? "0%" : "108%"})`,
                transition: `transform 1.1s cubic-bezier(.22,1,.36,1) ${i * 0.14}s`,
              }}
            >
              {word}
            </span>
          </span>
        ))}
      </h2>
      <Tilt
        to="/join"
        className="pm-cta-btn tilt"
        intensity={10}
        style={{
          textDecoration: "none",
          opacity: t,
          transform: `translateY(${t ? "0px" : "24px"}) scale(${t ? 1 : 0.96})`,
          transition: "opacity 0.9s ease 0.65s, transform 0.9s cubic-bezier(.22,1,.36,1) 0.65s",
        }}
      >
        Become a Member
        <span className="pm-btn-arrow" />
      </Tilt>
    </section>
  );
}

// ---- Home ----

export function Home() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <UpcomingEvents />
      <EventsSection />
      <SponsorsStrip />
      {/* PLACEHOLDER: Subsidiary / org structure diagram — insert asset here */}
      <FinalCTA />
      <div className="pm-event-banner-stack">
        <UpcomingEventBanner />
        <FreshersFairBanner />
      </div>
    </>
  );
}
