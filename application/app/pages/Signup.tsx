import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { useReveal } from "@/app/hooks/useReveal";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { supabase } from "@/lib/supabase";

const SUCCESS_TOAST_MS = 10000;

export function Signup() {
  useReveal();
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();

  // See AlumniRegister.tsx for why this is a floating toast rather than an
  // inline banner: the confirmation should be visible even if the visitor
  // has scrolled past the top of the form.
  const [toastVisible, setToastVisible] = useState(false);
  const [toastIn, setToastIn] = useState(false);
  const toastHideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toastUnmountTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hideToast = () => {
    clearTimeout(toastHideTimer.current);
    setToastIn(false);
    toastUnmountTimer.current = setTimeout(() => setToastVisible(false), 250);
  };

  useEffect(() => {
    if (status !== "sent") {
      if (toastVisible) hideToast();
      return;
    }
    clearTimeout(toastUnmountTimer.current);
    setToastVisible(true);
    const raf = requestAnimationFrame(() => setToastIn(true));
    toastHideTimer.current = setTimeout(hideToast, SUCCESS_TOAST_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toastHideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(
    () => () => {
      clearTimeout(toastHideTimer.current);
      clearTimeout(toastUnmountTimer.current);
    },
    []
  );

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    if ((form.elements.namedItem("bot-field") as HTMLInputElement)?.value) {
      succeed();
      return;
    }

    const fullName = (form.elements.namedItem("full-name") as HTMLInputElement).value.trim();
    const email = (form.elements.namedItem("email") as HTMLInputElement).value.trim();
    const course = (form.elements.namedItem("course") as HTMLInputElement).value.trim();
    const year = (form.elements.namedItem("year") as HTMLSelectElement).value;
    const phone = (form.elements.namedItem("phone") as HTMLInputElement).value.trim();
    const consentPrivacy = (form.elements.namedItem("consent-privacy") as HTMLInputElement).checked;

    if (!fullName || !email || !course || !year || !consentPrivacy) {
      fail("Please fill in your name, university email, course, year of study, and agree to the Privacy Policy.");
      return;
    }

    submitting();

    const { error: insertError } = await supabase.from("membership_signups").insert({
      full_name: fullName,
      email,
      course,
      year,
      phone: phone || null,
    });

    if (insertError) {
      console.error("Failed to submit membership signup", insertError);
      fail(
        insertError.code === "23505"
          ? "You've already signed up with that email."
          : "Something went wrong. Please try again, or get in touch through our Contact page."
      );
      return;
    }

    succeed();
    form.reset();
  };

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/join">Join</Link><span>/</span><span>Sign Up</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Join MUTIS</div>
            <h1 className="page-title r-up">Become a<br /><span className="accent">member</span></h1>
          </div>
          <p className="page-sub r-up">
            Membership is open to every University of Manchester student. Fill in your details below to sign up.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div style={{ maxWidth: 640, marginInline: "auto" }}>
            <div className="page-eyebrow r-up"><span className="bar" />Sign Up Form</div>
            <h2 className="r-up">Your details</h2>
            <p className="lede r-up">
              Fields marked * are required.
            </p>

            <form
              className="contact-form r-up"
              name="membership-signup"
              onSubmit={onSubmit}
              onInput={onFormInput}
              noValidate
              style={{ marginTop: 24 }}
            >
              <p className="hidden-field">
                <label>
                  Don't fill this out if you're human:{" "}
                  <input name="bot-field" tabIndex={-1} autoComplete="off" />
                </label>
              </p>

              <div className="field">
                <label htmlFor="su-full-name">Full name *</label>
                <input
                  id="su-full-name"
                  name="full-name"
                  type="text"
                  placeholder="First and last name"
                  autoComplete="name"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="su-email">University email *</label>
                <input
                  id="su-email"
                  name="email"
                  type="email"
                  placeholder="you@student.manchester.ac.uk"
                  autoComplete="email"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="su-course">Course *</label>
                <input
                  id="su-course"
                  name="course"
                  type="text"
                  placeholder="e.g. BSc Finance"
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="su-year">Year of study *</label>
                <select id="su-year" name="year" defaultValue="" required>
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
                <label htmlFor="su-phone">Phone (optional)</label>
                <input
                  id="su-phone"
                  name="phone"
                  type="tel"
                  placeholder="07xxx xxxxxx"
                  autoComplete="tel"
                />
              </div>

              <PrivacyConsent id="su-consent-privacy" />

              <FormFeedback status={status} error={error} />

              <button
                className="btn btn-primary"
                type="submit"
                disabled={status === "submitting"}
                aria-busy={status === "submitting"}
                style={{ alignSelf: "flex-start", marginTop: 8 }}
              >
                {status === "submitting" ? "Submitting…" : "Sign Up"}
                <span className="arrow" />
              </button>
            </form>
          </div>
        </div>
      </section>

      {toastVisible && (
        <div className="form-toast-wrap">
          <div className={toastIn ? "form-toast form-toast-success in" : "form-toast form-toast-success"}>
            <p role="status" aria-live="polite" aria-atomic="true">
              Thanks for signing up — welcome to MUTIS! Keep an eye on your inbox for details on our next weekly meeting.
            </p>
            <button type="button" className="form-toast-dismiss" onClick={hideToast} aria-label="Dismiss">
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
