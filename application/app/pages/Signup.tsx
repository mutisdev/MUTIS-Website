import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { useReveal } from "@/app/hooks/useReveal";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { UniEmailField, validateUniEmail } from "@/app/components/EmailField";
import { normaliseEmail } from "@shared/uniEmail";
import {
  ETHNICITY_GROUPS,
  ETHNICITY_PREFER_NOT_TO_SAY,
  CONTEXTUAL_OFFER_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  FIRST_GENERATION_OPTIONS,
  FREE_SCHOOL_MEALS_OPTIONS,
} from "@/app/data/diversityOptions";
import { Captcha } from "@/app/components/Captcha";
import { useCaptcha, CAPTCHA_FAILED_MESSAGE } from "@/app/hooks/useCaptcha";
import { submitForm } from "@/app/lib/submitForm";

const SUCCESS_TOAST_MS = 10000;

export function Signup() {
  useReveal();
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();
  const { captchaToken, resetCaptcha, captchaProps } = useCaptcha(fail);

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
    const consentPrivacy = (form.elements.namedItem("consent-privacy") as HTMLInputElement).checked;

    const ethnicity = (form.elements.namedItem("ethnicity") as HTMLSelectElement).value;
    const contextualOffer = (form.elements.namedItem("contextual-offer") as HTMLSelectElement).value;
    const schoolType = (form.elements.namedItem("school-type") as HTMLSelectElement).value;
    const firstGeneration = (form.elements.namedItem("first-generation") as HTMLSelectElement).value;
    const freeSchoolMeals = (form.elements.namedItem("free-school-meals") as HTMLSelectElement).value;

    if (
      !fullName ||
      !email ||
      !course ||
      !year ||
      !ethnicity ||
      !contextualOffer ||
      !schoolType ||
      !firstGeneration ||
      !freeSchoolMeals ||
      !consentPrivacy
    ) {
      fail("Please fill in every field above, and agree to the Privacy Policy.");
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

    const result = await submitForm("membership", captchaToken, {
      full_name: fullName,
      email: normaliseEmail(email),
      course,
      year,
      consent_privacy: consentPrivacy,
      ethnicity,
      contextual_offer_eligible: contextualOffer,
      school_type: schoolType,
      first_generation_student: firstGeneration,
      free_school_meals: freeSchoolMeals,
    });
    resetCaptcha();

    if (!result.ok) {
      fail(
        result.code === "duplicate"
          ? "You've already signed up with that email."
          : result.code === "captcha_failed"
            ? CAPTCHA_FAILED_MESSAGE
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
            <h1 className="page-title r-up">Join<br /><span className="accent">MUTIS</span></h1>
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

              <UniEmailField id="su-email" />

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

              <div className="page-eyebrow r-up" style={{ marginTop: 8 }}>
                <span className="bar" />Diversity &amp; Widening Participation
              </div>
              <p className="lede r-up" style={{ fontSize: 13, marginTop: 4 }}>
                This data helps us understand our members better, so we can run more representative and
                inclusive events and initiatives. Your answers are only added to anonymous totals. They are
                not stored against your name and are not shared with partner firms individually.
              </p>

              <div className="field">
                <label htmlFor="su-ethnicity">Ethnic background *</label>
                <select id="su-ethnicity" name="ethnicity" defaultValue="" required>
                  <option value="" disabled>Select…</option>
                  {ETHNICITY_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </optgroup>
                  ))}
                  <option value={ETHNICITY_PREFER_NOT_TO_SAY.value}>{ETHNICITY_PREFER_NOT_TO_SAY.label}</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="su-contextual-offer">Eligible for a contextual offer at Manchester? *</label>
                <select id="su-contextual-offer" name="contextual-offer" defaultValue="" required>
                  <option value="" disabled>Select…</option>
                  {CONTEXTUAL_OFFER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="su-school-type">Type of school attended *</label>
                <select id="su-school-type" name="school-type" defaultValue="" required>
                  <option value="" disabled>Select…</option>
                  {SCHOOL_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="su-first-gen">First-generation university student? *</label>
                <select id="su-first-gen" name="first-generation" defaultValue="" required>
                  <option value="" disabled>Select…</option>
                  {FIRST_GENERATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="su-free-school-meals">Eligible for free school meals? *</label>
                <select id="su-free-school-meals" name="free-school-meals" defaultValue="" required>
                  <option value="" disabled>Select…</option>
                  {FREE_SCHOOL_MEALS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <PrivacyConsent
                id="su-consent-privacy"
                additionalText="consent to this data being shared with partner firms to help bring better opportunities to MUTIS members"
              />

              <Captcha {...captchaProps} />

              <FormFeedback status={status} error={error} />

              <button
                className="btn btn-primary"
                type="submit"
                disabled={status === "submitting" || !captchaToken}
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
