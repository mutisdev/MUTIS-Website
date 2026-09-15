import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { EmailField, validateEmail } from "@/app/components/EmailField";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type EventRow = Tables<"events">;

const OTHER_EVENT = "__other__";

export function Attendance() {
  useReveal();
  const { settings } = useSiteSettings();
  const { status, error, submitting, fail, succeed, reset, onFormInput } = useFormStatus();
  const [rating, setRating] = useState<number | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState("");

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
    const otherEventName = eventId === OTHER_EVENT
      ? (form.elements.namedItem("other-event") as HTMLInputElement).value.trim()
      : "";
    const name = (form.elements.namedItem("attendee-name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const course = (form.elements.namedItem("course") as HTMLInputElement).value.trim();
    const year = (form.elements.namedItem("year") as HTMLSelectElement).value;
    const comments = (form.elements.namedItem("comments") as HTMLTextAreaElement).value.trim();
    const consentPrivacy = (form.elements.namedItem("consent-privacy") as HTMLInputElement).checked;

    if (!eventId || (eventId === OTHER_EVENT && !otherEventName) || !name || !email || !course || !year || !rating || !consentPrivacy) {
      fail(
        eventId === OTHER_EVENT
          ? "Please tell us which event you attended, fill in your name, email, course, and year of study, rate the event, and agree to the Privacy Policy."
          : "Please select the event you attended, fill in your name, email, course, and year of study, rate the event, and agree to the Privacy Policy."
      );
      return;
    }

    const emailError = validateEmail(email, true, true);
    if (emailError) {
      fail(emailError);
      return;
    }

    submitting();

    const { error: insertError } = await supabase.from("attendance_submissions").insert({
      event_id: eventId === OTHER_EVENT ? null : eventId,
      other_event_name: eventId === OTHER_EVENT ? otherEventName : null,
      name,
      email,
      course,
      year,
      rating,
      comments: comments || null,
    });

    if (insertError) {
      console.error("Failed to submit attendance", insertError);
      fail(
        insertError.code === "23505"
          ? "You've already logged your attendance for this event with that email."
          : `Something went wrong. Please try again or email us at ${settings.contact_email}.`
      );
      return;
    }

    succeed();
    form.reset();
    setRating(null);
    setSelectedEvent("");
  };

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/events">Events</Link><span>/</span><span>Attendance</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Events</div>
            <h1 className="page-title r-up"><span className="accent">Attendance</span></h1>
          </div>
          <p className="page-sub r-up">
            Attended a MUTIS event? Register your attendance below and share your feedback.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="contact-grid">
            <div>
              <div className="page-eyebrow r-up"><span className="bar" />Attendance Form</div>
              <h2 className="r-up">Sign in</h2>
              <p className="lede r-up">
                Fill in your details and let us know how the event went. All fields marked * are required.
              </p>

              {status === "sent" ? (
                <div style={{ marginTop: 32 }}>
                  <FormFeedback
                    status={status}
                    successMessage="Thanks for logging your attendance — your response has been recorded."
                    style={{ fontSize: 16 }}
                  />
                  <button
                    className="btn btn-ghost"
                    style={{ marginTop: 24, textDecoration: "none" }}
                    onClick={reset}
                  >
                    Submit another response
                  </button>
                </div>
              ) : (
                <form
                  className="contact-form r-up"
                  name="attendance"
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

                  {selectedEvent === OTHER_EVENT && (
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

                  <div className="field">
                    <label htmlFor="att-name">Full name *</label>
                    <input
                      id="att-name"
                      name="attendee-name"
                      type="text"
                      placeholder="First and last name"
                      autoComplete="name"
                      required
                    />
                  </div>

                  <EmailField
                    id="att-email"
                    label="University email *"
                    placeholder="you@student.manchester.ac.uk"
                    requireManchesterDomain
                  />

                  <div className="field">
                    <label htmlFor="att-course">Course *</label>
                    <input
                      id="att-course"
                      name="course"
                      type="text"
                      placeholder="e.g. BSc Finance"
                      required
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="att-year">Year of study *</label>
                    <select id="att-year" name="year" defaultValue="" required>
                      <option value="" disabled>Select year…</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                      <option value="Masters">Masters</option>
                      <option value="PhD">PhD</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="att-rating-1">How would you rate the event? *</label>
                    <div
                      role="radiogroup"
                      aria-labelledby="att-rating-1"
                      style={{ display: "flex", gap: 8 }}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          id={n === 1 ? "att-rating-1" : undefined}
                          type="button"
                          role="radio"
                          aria-checked={rating === n}
                          onClick={() => setRating(n)}
                          style={{
                            flex: 1,
                            padding: "12px 0",
                            fontSize: 16,
                            fontWeight: 600,
                            fontVariantNumeric: "tabular-nums",
                            borderRadius: 8,
                            border: rating === n ? "1px solid var(--pm-accent)" : "1px solid var(--hair)",
                            background: rating === n ? "var(--pm-accent)" : "transparent",
                            color: rating === n ? "var(--base)" : "var(--ink)",
                            cursor: "pointer",
                            transition: "background 0.15s, border-color 0.15s, color 0.15s",
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-soft)", letterSpacing: "0.08em", marginTop: 4 }}>
                      <span>1 — Poor</span>
                      <span>5 — Excellent</span>
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="att-comments">Any comments? (optional)</label>
                    <textarea
                      id="att-comments"
                      name="comments"
                      placeholder="What did you enjoy? What could be improved?"
                    />
                  </div>

                  <PrivacyConsent id="att-consent-privacy" />

                  <FormFeedback status={status} error={error} />

                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={status === "submitting"}
                    aria-busy={status === "submitting"}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    {status === "submitting" ? "Submitting…" : "Log Attendance"}
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
                <div className="l">Questions</div>
                <div className="v">
                  <a href={`mailto:${settings.contact_email}`}>
                    {settings.contact_email}
                  </a>
                </div>
              </div>
              <div className="row">
                <div className="l">Instagram</div>
                <div className="v">
                  <a href={settings.instagram_url} target="_blank" rel="noreferrer">
                    @mutisfinancesoc
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
