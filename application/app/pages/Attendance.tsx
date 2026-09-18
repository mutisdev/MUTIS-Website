import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { UniEmailField, validateUniEmail } from "@/app/components/EmailField";
import { normaliseEmail } from "@shared/uniEmail";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { Captcha } from "@/app/components/Captcha";
import { useCaptcha, CAPTCHA_FAILED_MESSAGE } from "@/app/hooks/useCaptcha";
import { submitForm } from "@/app/lib/submitForm";

type EventRow = Tables<"events">;

const OTHER_EVENT = "__other__";

const RATINGS = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));

/**
 * Anonymous event feedback. Reached by QR code at events, so the URL stays
 * /attendance. Feedback is stored with no name or email. If the visitor says
 * they're a member, the submit-form function records their attendance in a
 * separate table that has no link to this feedback.
 */
export function Attendance() {
  useReveal();
  const { settings } = useSiteSettings();
  const { status, error, submitting, fail, succeed, reset, onFormInput } = useFormStatus();
  const { captchaToken, resetCaptcha, captchaProps } = useCaptcha(fail);
  const [rating, setRating] = useState<number | null>(null);
  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState("");

  const isOtherEvent = selectedEvent === OTHER_EVENT;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("events")
      .select("*")
      .eq("is_published", true)
      .order("starts_at", { ascending: false })
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) console.error("Failed to load events", fetchError);
        setEvents(data ?? []);
        setEventsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    if ((form.elements.namedItem("bot-field") as HTMLInputElement)?.value) {
      succeed();
      return;
    }

    const eventId = (form.elements.namedItem("event") as HTMLSelectElement).value;
    const otherEventName = isOtherEvent
      ? (form.elements.namedItem("other-event") as HTMLInputElement).value.trim()
      : "";
    const comments = (form.elements.namedItem("comments") as HTMLTextAreaElement).value.trim();
    // The member question is hidden for "Other" events: there's no event to credit.
    const memberAnswer = isOtherEvent ? false : isMember;
    const email = memberAnswer
      ? (form.elements.namedItem("email") as HTMLInputElement).value.trim()
      : "";

    if (!eventId || (isOtherEvent && !otherEventName) || memberAnswer === null || !rating) {
      fail(
        isOtherEvent
          ? "Please tell us which event you attended and rate it."
          : "Please choose the event you attended, tell us whether you're a MUTIS member, and rate the event."
      );
      return;
    }

    if (memberAnswer) {
      const emailError = validateUniEmail(email);
      if (emailError) {
        fail(emailError);
        return;
      }
    }

    if (!captchaToken) {
      fail("Please tick the captcha box.");
      return;
    }

    submitting();

    const result = await submitForm("attendance", captchaToken, {
      event_id: isOtherEvent ? null : eventId,
      other_event_name: isOtherEvent ? otherEventName : null,
      is_member: memberAnswer,
      email: memberAnswer ? normaliseEmail(email) : null,
      rating,
      comments: comments || null,
    });
    resetCaptcha();

    if (!result.ok) {
      fail(
        result.code === "captcha_failed"
          ? CAPTCHA_FAILED_MESSAGE
          : result.code === "invalid" && result.message
            ? result.message
            : `Something went wrong. Please try again or email us at ${settings.contact_email}.`
      );
      return;
    }

    succeed();
    form.reset();
    setRating(null);
    setIsMember(null);
    setSelectedEvent("");
  };

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/events">Events</Link><span>/</span><span>Feedback</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Events</div>
            <h1 className="page-title r-up">Event<br /><span className="accent">Feedback</span></h1>
          </div>
          <p className="page-sub r-up">
            Been to a MUTIS event? Tell us how it went. It takes under a minute.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="contact-grid">
            <div>
              <div className="page-eyebrow r-up"><span className="bar" />Feedback form</div>
              <h2 className="r-up">How was it?</h2>
              <p className="lede r-up">
                Your feedback is anonymous. If you tell us you're a member, we record that you attended
                separately from your feedback.
              </p>

              {status === "sent" ? (
                <div style={{ marginTop: 32 }}>
                  <FormFeedback
                    status={status}
                    successMessage="Thanks for your feedback — it's been recorded."
                    style={{ fontSize: 16 }}
                  />
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 24, textDecoration: "none" }}
                    onClick={reset}
                  >
                    Give feedback on another event
                  </button>
                </div>
              ) : (
                <form
                  className="contact-form r-up"
                  name="event-feedback"
                  onSubmit={onSubmit}
                  onInput={onFormInput}
                  noValidate
                >
                  <p className="hidden-field">
                    <label>
                      Don't fill this out if you're human:{" "}
                      <input name="bot-field" tabIndex={-1} autoComplete="off" />
                    </label>
                  </p>

                  <div className="field">
                    <label htmlFor="att-event">Which event did you attend? *</label>
                    <select
                      id="att-event"
                      name="event"
                      value={selectedEvent}
                      onChange={(e) => setSelectedEvent(e.target.value)}
                      required
                    >
                      <option value="" disabled>
                        {eventsLoading ? "Loading events…" : "Select an event…"}
                      </option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.title} — {new Date(ev.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </option>
                      ))}
                      <option value={OTHER_EVENT}>Other (not listed here)</option>
                    </select>
                  </div>

                  {isOtherEvent && (
                    <div className="field">
                      <label htmlFor="att-other-event">Event name *</label>
                      <input
                        id="att-other-event"
                        name="other-event"
                        type="text"
                        placeholder="Tell us the name of the event"
                        required
                      />
                    </div>
                  )}

                  {!isOtherEvent && (
                    <fieldset className="field-radios">
                      <legend>Are you a MUTIS member? *</legend>
                      <div className="radio-row">
                        {[
                          { value: true, label: "Yes" },
                          { value: false, label: "No" },
                        ].map((o) => (
                          <label key={o.label}>
                            <input
                              type="radio"
                              name="is-member"
                              value={o.label.toLowerCase()}
                              checked={isMember === o.value}
                              onChange={() => setIsMember(o.value)}
                              required
                            />
                            {o.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  )}

                  {!isOtherEvent && isMember && (
                    <UniEmailField
                      id="att-email"
                      label="Your university email *"
                      placeholder="The email you signed up to MUTIS with"
                    />
                  )}

                  <ChoiceGroup
                    id="att-rating"
                    label="How would you rate the event? *"
                    options={RATINGS}
                    value={rating}
                    onChange={setRating}
                    footer={
                      <div className="choice-scale-ends" aria-hidden="true">
                        <span>1 — Poor</span>
                        <span>5 — Excellent</span>
                      </div>
                    }
                  />

                  <div className="field">
                    <label htmlFor="att-comments">Any comments? (optional)</label>
                    <textarea
                      id="att-comments"
                      name="comments"
                      placeholder="What did you enjoy? What could be improved?"
                      aria-describedby="att-comments-hint"
                    />
                    <span id="att-comments-hint" className="field-hint">
                      Please don't include your name or contact details.
                    </span>
                  </div>

                  <Captcha {...captchaProps} />

                  <FormFeedback status={status} error={error} />

                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={status === "submitting" || !captchaToken}
                    aria-busy={status === "submitting"}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    {status === "submitting" ? "Sending…" : "Send feedback"}
                    <span className="arrow" />
                  </button>
                </form>
              )}
            </div>

            <div className="contact-info r-up">
              <div className="row">
                <div className="l">Events</div>
                <div className="v">
                  <Link to="/events" style={{ color: "var(--pm-accent)" }}>View all events →</Link>
                </div>
              </div>
              <div className="row">
                <div className="l">Privacy</div>
                <div className="v">
                  <Link to="/privacy" style={{ color: "var(--pm-accent)" }}>How we handle feedback →</Link>
                </div>
              </div>
              <div className="row">
                <div className="l">Questions</div>
                <div className="v">
                  <a href={`mailto:${settings.contact_email}`}>
                    {settings.contact_email}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * A row of equal-width square buttons that behaves as a radio group (the
 * 1–5 rating): one tab stop, arrow keys move the selection (WAI-ARIA radio pattern).
 */
function ChoiceGroup<T extends string | number>({
  id,
  label,
  options,
  value,
  onChange,
  footer,
}: {
  id: string;
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  footer?: React.ReactNode;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const labelId = `${id}-label`;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const focusIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (focusIndex + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div className="field">
      <span id={labelId} className="choice-scale-label">{label}</span>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className="choice-scale"
        style={{ gridTemplateColumns: `repeat(${options.length}, minmax(44px, 1fr))` }}
        onKeyDown={onKeyDown}
      >
        {options.map((o, i) => (
          <button
            key={String(o.value)}
            ref={(el) => {
              buttons.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            tabIndex={i === focusIndex ? 0 : -1}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {footer}
    </div>
  );
}
