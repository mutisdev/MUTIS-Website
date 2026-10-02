import { type FormEvent } from "react";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { UniEmailField, validateUniEmail } from "@/app/components/EmailField";
import { Captcha } from "@/app/components/Captcha";
import { useCaptcha } from "@/app/hooks/useCaptcha";
import { normaliseEmail } from "@shared/uniEmail";
import { submitForm, submitErrorMessage } from "@/app/lib/submitForm";

/**
 * The standard event sign-up: name, university email, consent. Moved out of
 * EventSignup.tsx unchanged when application mode was added, so that page could
 * branch between the two forms without either growing. This is the path every
 * event that isn't in application mode still takes, and its behaviour is
 * deliberately identical to before the move.
 */
export function SignupForm({ eventId }: { eventId: string }) {
  const { status, error, submitting, fail, succeed, reset, onFormInput } = useFormStatus();
  const { captchaToken, resetCaptcha, captchaProps } = useCaptcha(fail);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
      event_id: eventId,
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

  if (status === "sent") {
    return (
      <div style={{ marginTop: 24 }}>
        <FormFeedback status={status} successMessage="You're signed up — see you there." style={{ fontSize: 16 }} />
        <button className="btn btn-ghost" style={{ marginTop: 24, textDecoration: "none" }} onClick={reset}>
          Sign up someone else
        </button>
      </div>
    );
  }

  return (
    <form
      className="contact-form r-up"
      name="event-signup"
      onSubmit={onSubmit}
      onInput={onFormInput}
      noValidate
      style={{ marginTop: 24, maxWidth: 480 }}
    >
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
  );
}
