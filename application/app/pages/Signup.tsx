import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { X } from "lucide-react";
import { useReveal } from "@/app/hooks/useReveal";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { EmailField, validateEmail } from "@/app/components/EmailField";
import {
  ETHNICITY_GROUPS,
  ETHNICITY_PREFER_NOT_TO_SAY,
  ETHNICITY_OTHER_VALUES,
  CONTEXTUAL_OFFER_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  FIRST_GENERATION_OPTIONS,
  FREE_SCHOOL_MEALS_OPTIONS,
} from "@/app/data/diversityOptions";
import { supabase } from "@/lib/supabase";

const SUCCESS_TOAST_MS = 10000;

export function Signup() {
  useReveal();
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();
  const [ethnicity, setEthnicity] = useState("");

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

    const ethnicityOther = (form.elements.namedItem("ethnicity-other") as HTMLInputElement | null)?.value.trim() ?? "";
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
      (ETHNICITY_OTHER_VALUES.has(ethnicity) && !ethnicityOther) ||
      !contextualOffer ||
      !schoolType ||
      !firstGeneration ||
      !freeSchoolMeals ||
      !consentPrivacy
    ) {
      fail("Please fill in every field above, and agree to the Privacy Policy.");
      return;
    }

    const emailError = validateEmail(email, true, true);
    if (emailError) {
      fail(emailError);
      return;
    }

    submitting();

    // Generated client-side (rather than read back after insert) because the
    // public "anon" role only has INSERT on membership_signups, not SELECT —
    // deliberately, so a visitor can't read other people's signups. Setting
    // id explicitly here just overrides the column's own gen_random_uuid()
    // default with a value we already know, for the diversity FK below.
    const signupId = crypto.randomUUID();
    const consentAt = new Date().toISOString();

    const { error: insertError } = await supabase.from("membership_signups").insert({
      id: signupId,
      full_name: fullName,
      email,
      course,
      year,
      consent_share_partners: consentPrivacy,
      consent_share_partners_at: consentAt,
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

    const { error: diversityError } = await supabase.from("membership_signup_diversity").insert({
      signup_id: signupId,
      ethnicity,
      ethnicity_other_description: ETHNICITY_OTHER_VALUES.has(ethnicity) ? ethnicityOther : null,
      contextual_offer_eligible: contextualOffer,
      school_type: schoolType,
      first_generation_student: firstGeneration,
      free_school_meals: freeSchoolMeals,
    });
    // Diversity data is supplementary — a failure here shouldn't undo an
    // already-successful signup, just gets logged for follow-up.
    if (diversityError) console.error("Failed to submit diversity data", diversityError);

    succeed();
    form.reset();
    setEthnicity("");
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

              <EmailField
                id="su-email"
                label="University email *"
                placeholder="you@student.manchester.ac.uk"
                requireManchesterDomain
              />

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
                inclusive events and initiatives.
              </p>

              <div className="field">
                <label htmlFor="su-ethnicity">Ethnic background *</label>
                <select
                  id="su-ethnicity"
                  name="ethnicity"
                  value={ethnicity}
                  onChange={(e) => setEthnicity(e.target.value)}
                  required
                >
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

              {ETHNICITY_OTHER_VALUES.has(ethnicity) && (
                <div className="field">
                  <label htmlFor="su-ethnicity-other">Please describe *</label>
                  <input
                    id="su-ethnicity-other"
                    name="ethnicity-other"
                    type="text"
                    placeholder="Please describe your ethnic background"
                    required
                  />
                </div>
              )}

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
