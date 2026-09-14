import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Helmet } from "react-helmet-async";
import DOMPurify from "dompurify";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { SITE_URL } from "@/app/hooks/usePageMeta";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { Modal } from "@/app/components/Modal";

const FLAGSHIP = [
  { num: "E.01", title: "Women in Finance Conference", term: "Autumn Term", desc: "A flagship day bringing senior women from across investment banking, asset management, and markets onto campus.", foot: "Manchester" },
  { num: "E.02", title: "UK Student Finance Summit", term: "Spring Term", desc: "The largest cross-university gathering of finance students in the UK, hosted by MUTIS in partnership with leading firms.", foot: "Manchester" },
  { num: "E.03", title: "M&A Challenge", term: "Year-round", desc: "A live deal simulation run across the year, judged by working bankers from sponsor firms.", foot: "Manchester" },
  { num: "E.04", title: "The Shade Tree", term: "Spring Term", desc: "A 25-year, student-run investment initiative run annually with Alliance Manchester Business School, where MUTIS teams pitch real long-term investment theses for capital donated by alumni Adam and Sara Franks.", foot: "Manchester" },
];

const eventImageModules = import.meta.glob(
  "../../assets/events/*.{jpg,jpeg,png,webp,avif,JPG,JPEG,PNG,WEBP,AVIF}",
  { eager: true, import: "default" },
) as Record<string, string>;

const PAST_EVENT_IMAGES = Object.entries(eventImageModules)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, src]) => src);

type EventRow = Tables<"events">;

const formatEventDate = (isoString: string) =>
  new Date(isoString).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

function EventSignupForm({ eventId }: { eventId: string }) {
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    if ((form.elements.namedItem("bot-field") as HTMLInputElement)?.value) {
      succeed();
      return;
    }

    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const notes = (form.elements.namedItem("notes") as HTMLTextAreaElement).value.trim();
    const consentPrivacy = (form.elements.namedItem("consent-privacy") as HTMLInputElement).checked;

    if (!name || !email || !consentPrivacy) {
      fail("Please fill in your name and email, and agree to the Privacy Policy.");
      return;
    }

    submitting();

    const { error: insertError } = await supabase
      .from("event_signups")
      .insert({ event_id: eventId, name, email, notes: notes || null });

    if (insertError) {
      console.error("Failed to submit event signup", insertError);
      fail(
        insertError.code === "23505"
          ? "You've already signed up for this event with that email."
          : "Something went wrong. Please try again or email us at mutis@manchesterstudentsunion.com.",
      );
      return;
    }

    succeed();
    form.reset();
  };

  if (status === "sent") {
    return (
      <FormFeedback
        status={status}
        successMessage="You're signed up — see you there."
        style={{ marginTop: 12 }}
      />
    );
  }

  return (
    <form className="contact-form" onSubmit={onSubmit} onInput={onFormInput} noValidate style={{ marginTop: 16, gap: 10 }}>
      <p className="hidden-field">
        <label>
          Don't fill this out if you're human: <input name="bot-field" tabIndex={-1} autoComplete="off" />
        </label>
      </p>
      <div className="field">
        <label htmlFor={`su-name-${eventId}`}>Full name *</label>
        <input id={`su-name-${eventId}`} name="name" type="text" autoComplete="name" required />
      </div>
      <div className="field">
        <label htmlFor={`su-email-${eventId}`}>Email *</label>
        <input id={`su-email-${eventId}`} name="email" type="email" autoComplete="email" required />
      </div>
      <div className="field">
        <label htmlFor={`su-notes-${eventId}`}>Notes (optional)</label>
        <textarea id={`su-notes-${eventId}`} name="notes" />
      </div>
      <PrivacyConsent id={`su-consent-privacy-${eventId}`} />
      <FormFeedback status={status} error={error} />
      <button
        className="btn btn-primary"
        type="submit"
        disabled={status === "submitting"}
        aria-busy={status === "submitting"}
        style={{ alignSelf: "flex-start" }}
      >
        {status === "submitting" ? "Signing up…" : "Sign up"}
        <span className="arrow" />
      </button>
    </form>
  );
}

export function Events() {
  const { settings } = useSiteSettings();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modalEvent, setModalEvent] = useState<EventRow | null>(null);

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
  // hardcoded. There's no per-event detail route (events only open in the
  // modal below), so `url` points at this listing page for every entry;
  // see SEO-AUDIT.md 3.1 for that limitation.
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
            url: `${SITE_URL}/events`,
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
            <div className="page-eyebrow r-up"><span className="bar" />Events</div>
            <h1 className="page-title r-up">Where members<br />meet <span className="accent">markets</span></h1>
          </div>
          <p className="page-sub r-up">From flagship conferences to weekly partner sessions  -  MUTIS events put members in the same room as the people hiring them.</p>
        </div>
      </section>

      {settings.freshers_fair_banner_enabled && (
        <section className="page-section" style={{ paddingTop: 32, paddingBottom: 32, background: "var(--pm-accent)" }}>
          <div className="inner" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500, color: "var(--base)" }}>
              Come find us at the Freshers Fair — meet the committee and sign up on the day.
            </p>
            <Link to="/signup" className="btn btn-primary" style={{ textDecoration: "none", background: "var(--base)", color: "var(--pm-accent)" }}>
              Sign up to MUTIS <span className="arrow" />
            </Link>
          </div>
        </section>
      )}

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Section 01  -  Flagship</div>
          <h2 className="r-up">Four events define the year</h2>
          <div className="card-grid">
            {FLAGSHIP.map((e) => (
              <div className="dark-card r-up" key={e.num}>
                <div className="num">{e.num}</div>
                <h3>{e.title}</h3>
                <div className="meta">{e.term}</div>
                <p className="excerpt">{e.desc}</p>
                <div className="foot"><span>{e.foot}</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section" style={{ background: "var(--base)", borderTop: "1px solid rgba(255,255,255,0.05)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Section 02  -  Upcoming Term</div>
          <h2 className="r-up">Upcoming events</h2>
          {isLoading ? (
            <p className="lede r-up" role="status">Loading upcoming events…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : events.length === 0 ? (
            <p className="lede r-up">No upcoming events are currently scheduled  -  check back soon, or follow us on Instagram for the latest.</p>
          ) : (
            <div className="card-grid">
              {events.map((ev) => (
                <div className="dark-card r-up" key={ev.id}>
                  {ev.cover_image_url && (
                    <img
                      src={ev.cover_image_url}
                      alt={ev.title}
                      className="article-thumb"
                      width={400}
                      height={225}
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
                    <button type="button" className="more" onClick={() => setModalEvent(ev)}>View details →</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Section 03  -  Past Events</div>
          <h2 className="r-up">Past events</h2>
          <p className="lede r-up">
            Want to see who&apos;s spoken at MUTIS?{" "}
            <Link to="/past-speakers" style={{ color: "var(--pm-accent)", textDecoration: "underline" }}>
              Browse our past speakers →
            </Link>
          </p>
          <div className="image-belt r-up" aria-label="Past event photos">
            <div className="image-track">
              {[...PAST_EVENT_IMAGES, ...PAST_EVENT_IMAGES].map((src, i) => {
                const isDuplicate = i >= PAST_EVENT_IMAGES.length;
                return (
                  <div className="image-cell" key={src + i} aria-hidden={isDuplicate || undefined}>
                    <img
                      src={src}
                      alt={isDuplicate ? "" : "MUTIS event photo"}
                      width={220}
                      height={130}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <Modal open={modalEvent !== null} onClose={() => setModalEvent(null)} labelledBy="event-modal-title">
        {modalEvent && (
          <>
            {modalEvent.cover_image_url && (
              <img src={modalEvent.cover_image_url} alt={modalEvent.title} className="modal-cover" width={400} height={225} />
            )}
            <div className="modal-body">
              <h3 id="event-modal-title">{modalEvent.title}</h3>
              <div className="modal-meta">
                <span>{formatEventDate(modalEvent.starts_at)}</span>
                <span>·</span>
                <span>{modalEvent.location}</span>
              </div>
              {modalEvent.tags.length > 0 && (
                <div className="tag-list" style={{ marginBottom: 24 }}>
                  {modalEvent.tags.map((tag) => (
                    <span key={tag} className="tag-badge">{tag}</span>
                  ))}
                </div>
              )}
              <div
                className="article-body"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(modalEvent.description) }}
              />
              {modalEvent.signup_enabled && (
                <>
                  <hr className="modal-divider" />
                  <p className="modal-signup-head">Sign up</p>
                  <p className="modal-signup-note">Reserve your spot — we'll only use these details for this event.</p>
                  <EventSignupForm eventId={modalEvent.id} />
                </>
              )}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
