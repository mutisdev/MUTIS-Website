import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import DOMPurify from "dompurify";
import { useReveal } from "@/app/hooks/useReveal";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { PageMeta } from "@/app/components/PageMeta";
import { DEFAULT_DESCRIPTION } from "@/app/hooks/usePageMeta";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { UniEmailField, validateUniEmail } from "@/app/components/EmailField";
import { normaliseEmail } from "@shared/uniEmail";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { Captcha } from "@/app/components/Captcha";
import { useCaptcha } from "@/app/hooks/useCaptcha";
import { submitForm, submitErrorMessage } from "@/app/lib/submitForm";

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

  const { status, error, submitting, fail, succeed, reset, onFormInput } = useFormStatus();
  const { captchaToken, resetCaptcha, captchaProps } = useCaptcha(fail);

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

  useReveal([event?.id, isLoading, loadError]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!event) return;
    const form = e.currentTarget;

    if ((form.elements.namedItem("bot-field") as HTMLInputElement)?.value) {
      succeed();
      return;
    }

    const name = (form.elements.namedItem("name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const consentPrivacy = (form.elements.namedItem("consent-privacy") as HTMLInputElement).checked;

    if (!name || !email || !consentPrivacy) {
      fail("Please fill in your name and university email, and agree to the Privacy Policy.");
      return;
    }

    const emailError = validateUniEmail(email);
    if (emailError) {
      fail(emailError);
      return;
    }

    if (!captchaToken) {
      fail("Please tick the captcha box.");
      return;
    }

    submitting();

    const result = await submitForm("event_signup", captchaToken, {
      event_id: event.id,
      name,
      email: normaliseEmail(email),
      consent_privacy: consentPrivacy,
    });
    resetCaptcha();

    if (!result.ok) {
      fail(
        submitErrorMessage(result, {
          contact: "email us at mutis@manchesterstudentsunion.com",
          duplicate: "You've already signed up for this event with that email.",
        }),
      );
      return;
    }

    succeed();
    form.reset();
  };

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

  return (
    <>
      <PageMeta
        pathname={`/events/${event.id}/signup`}
        override={{
          title: `Sign up — ${event.title} | MUTIS Finance Society`,
          description: htmlToExcerpt(event.description, 160) || DEFAULT_DESCRIPTION,
          image: event.cover_image_url ?? undefined,
          noindex: true,
        }}
      />

      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/events">Events</Link><span>/</span><span>Sign up</span>
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

              <div className="page-eyebrow r-up"><span className="bar" />Sign up</div>
              <h2 className="r-up">Reserve your spot</h2>

              {!event.signup_enabled ? (
                <p className="event-signup-closed r-up">
                  Signups aren't open for this event right now. Check back later, or head to the{" "}
                  <Link to="/events">events page</Link> for other upcoming events.
                </p>
              ) : status === "sent" ? (
                <div style={{ marginTop: 24 }}>
                  <FormFeedback status={status} successMessage="You're signed up — see you there." style={{ fontSize: 16 }} />
                  <button className="btn btn-ghost" style={{ marginTop: 24, textDecoration: "none" }} onClick={reset}>
                    Sign up someone else
                  </button>
                </div>
              ) : (
                <form className="contact-form r-up" name="event-signup" onSubmit={onSubmit} onInput={onFormInput} noValidate style={{ marginTop: 24, maxWidth: 480 }}>
                  <p className="hidden-field">
                    <label>
                      Don't fill this out if you're human: <input name="bot-field" tabIndex={-1} autoComplete="off" />
                    </label>
                  </p>
                  <div className="field">
                    <label htmlFor="su-name">Full name *</label>
                    <input id="su-name" name="name" type="text" autoComplete="name" required />
                  </div>
                  <UniEmailField id="su-email" />
                  <PrivacyConsent id="su-consent-privacy" />
                  <Captcha {...captchaProps} />
                  <FormFeedback status={status} error={error} />
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={status === "submitting" || !captchaToken}
                    aria-busy={status === "submitting"}
                    style={{ alignSelf: "flex-start" }}
                  >
                    {status === "submitting" ? "Signing up…" : "Sign up"}
                    <span className="arrow" />
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
