import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import DOMPurify from "dompurify";
import { useReveal } from "@/app/hooks/useReveal";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { PageMeta } from "@/app/components/PageMeta";
import { DEFAULT_DESCRIPTION } from "@/app/hooks/usePageMeta";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { hasEventEnded } from "@shared/eventStatus";
import type { ApplicationReceiptData } from "@/app/lib/submitApplication";
import { SignupForm } from "./event-signup/SignupForm";
import { ApplicationForm } from "./event-signup/ApplicationForm";
import { ApplicationReceipt } from "./event-signup/ApplicationReceipt";
import { useEventQuestions } from "./event-signup/useEventQuestions";

type EventRow = Tables<"events">;

const formatEventDate = (isoString: string) =>
  new Date(isoString).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

export function EventSignup() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [receipt, setReceipt] = useState<{ data: ApplicationReceiptData; emailed: boolean } | null>(null);

  // Only fetched for an event actually in application mode; RLS additionally
  // limits the rows to published application-mode events.
  const requiresApplication = event?.requires_application ?? false;
  const {
    questions,
    loading: questionsLoading,
    error: questionsError,
    fingerprint,
  } = useEventQuestions(event?.id, requiresApplication);

  useEffect(() => {
    let cancelled = false;

    const loadEvent = async () => {
      if (!eventId) {
        setEvent(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");

      const { data, error: fetchError } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .eq("is_published", true)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (fetchError) {
        console.error("Failed to load event", fetchError);
        setLoadError("We could not load this event right now. Please refresh the page.");
        setEvent(null);
        setIsLoading(false);
        return;
      }

      setEvent(data);
      setIsLoading(false);
    };

    void loadEvent();

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useReveal([event?.id, isLoading, loadError, questions.length, receipt !== null]);

  if (isLoading) {
    return (
      <section className="page-section">
        <div className="inner">
          <p className="lede r-up" role="status">Loading event…</p>
        </div>
      </section>
    );
  }

  if (loadError || !event) {
    return (
      <section className="page-section">
        <PageMeta
          pathname={`/events/${eventId ?? ""}/signup`}
          override={{
            title: "Event not found | MUTIS Finance Society",
            description: DEFAULT_DESCRIPTION,
            noindex: true,
            noCanonical: true,
          }}
        />
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Events</div>
          <h2 className="r-up">{loadError ? "Something went wrong" : "Event not found"}</h2>
          <p className="lede r-up">
            {loadError || "This event doesn't exist, isn't published, or has been removed."}
          </p>
          <div className="r-up" style={{ marginTop: 24 }}>
            <Link to="/events" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Back to events <span className="arrow" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Wording differs between the two modes; the gates themselves don't.
  const closedCopy = requiresApplication
    ? {
        ended: "This event has already happened, so applications are closed.",
        disabled: "Applications aren't open for this event right now.",
      }
    : {
        ended: "This event has already happened, so signups are closed.",
        disabled: "Signups aren't open for this event right now.",
      };

  // Application mode with no questions is an admin mid-edit, not a usable form —
  // the Edge Function refuses it too, so don't render an empty application.
  const applicationNotReady = requiresApplication && !questionsLoading && questions.length === 0;

  const renderFormSlot = () => {
    // Checked before the closed-signup gates: once someone has submitted, their
    // receipt is theirs to read and print, even if an admin closes applications
    // or the event ends while the page is still open.
    if (receipt) return <ApplicationReceipt receipt={receipt.data} emailed={receipt.emailed} />;

    if (hasEventEnded(event)) {
      return (
        <p className="event-signup-closed r-up">
          {closedCopy.ended} Head to the <Link to="/events">events page</Link> for upcoming events.
        </p>
      );
    }
    if (!event.signup_enabled || applicationNotReady) {
      return (
        <p className="event-signup-closed r-up">
          {closedCopy.disabled} Check back later, or head to the{" "}
          <Link to="/events">events page</Link> for other upcoming events.
        </p>
      );
    }

    if (!requiresApplication) return <SignupForm eventId={event.id} />;

    if (questionsLoading) {
      return (
        <p className="lede r-up" role="status" style={{ marginTop: 24 }}>
          Loading the application form…
        </p>
      );
    }
    if (questionsError) {
      return (
        <p className="form-status form-error r-up" role="alert" style={{ marginTop: 24 }}>
          {questionsError}
        </p>
      );
    }
    return (
      <ApplicationForm
        eventId={event.id}
        questions={questions}
        fingerprint={fingerprint}
        onSubmitted={(data, emailed) => setReceipt({ data, emailed })}
      />
    );
  };

  return (
    <>
      <PageMeta
        pathname={`/events/${event.id}/signup`}
        override={{
          title: `${requiresApplication ? "Apply" : "Sign up"} — ${event.title} | MUTIS Finance Society`,
          description: htmlToExcerpt(event.description, 160) || DEFAULT_DESCRIPTION,
          image: event.cover_image_url ?? undefined,
          noindex: true,
        }}
      />

      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/events">Events</Link><span>/</span>
              <span>{requiresApplication ? "Apply" : "Sign up"}</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Events</div>
            <h1 className="page-title r-up">{event.title}</h1>
          </div>
          <p className="page-sub r-up">
            {formatEventDate(event.starts_at)} · {event.location}
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="split">
            <div className="event-signup-poster-wrap r-up">
              {event.cover_image_url ? (
                <img
                  src={event.cover_image_url}
                  alt={event.title}
                  className="event-signup-poster"
                  decoding="async"
                />
              ) : (
                <div className="event-signup-poster-fallback" aria-hidden="true">
                  {event.title}
                </div>
              )}
            </div>

            <div>
              <div className="event-signup-meta r-up">
                <span>{formatEventDate(event.starts_at)}</span>
                <span>{event.location}</span>
              </div>
              {event.tags.length > 0 && (
                <div className="tag-list r-up">
                  {event.tags.map((tag) => (
                    <span key={tag} className="tag-badge">{tag}</span>
                  ))}
                </div>
              )}
              <div
                className="article-body r-up"
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(event.description) }}
              />

              <hr className="modal-divider" />

              <div className="page-eyebrow r-up">
                <span className="bar" />
                {requiresApplication ? "Apply" : "Sign up"}
              </div>
              <h2 className="r-up">{requiresApplication ? "Apply for a place" : "Reserve your spot"}</h2>
              {renderFormSlot()}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
