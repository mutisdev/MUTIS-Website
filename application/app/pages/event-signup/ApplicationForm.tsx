import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { UniEmailField, validateUniEmail } from "@/app/components/EmailField";
import { Captcha } from "@/app/components/Captcha";
import { useCaptcha } from "@/app/hooks/useCaptcha";
import { normaliseEmail } from "@shared/uniEmail";
import {
  APPLICANT_NAME_MAX_CHARS,
  CV_RETENTION_DAYS,
  validateAnswer,
  type ApplicationQuestion,
} from "@shared/eventApplications";
import {
  applicationErrorMessage,
  submitApplication,
  type ApplicationReceiptData,
} from "@/app/lib/submitApplication";
import { CvField } from "./CvField";
import { QuestionField } from "./QuestionField";

interface ApplicationFormProps {
  eventId: string;
  questions: ApplicationQuestion[];
  fingerprint: string;
  onSubmitted: (receipt: ApplicationReceiptData, emailed: boolean) => void;
}

/**
 * The public application form: name, email, the admin's questions in position
 * order, and a mandatory CV. Replaces the standard sign-up form for events in
 * application mode; events that aren't keep SignupForm untouched.
 *
 * Answers are controlled state (rather than read off the DOM on submit, as the
 * older forms do) because a failed submission must not lose what someone typed —
 * these answers can be several paragraphs, not a name and an email.
 */
export function ApplicationForm({ eventId, questions, fingerprint, onSubmitted }: ApplicationFormProps) {
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();
  const { captchaToken, resetCaptcha, captchaProps } = useCaptcha(fail);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [cv, setCv] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cvError, setCvError] = useState("");

  const setAnswer = (questionId: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    // Clear an inline error as soon as the visitor addresses it.
    setFieldErrors((prev) => (prev[questionId] ? { ...prev, [questionId]: "" } : prev));
  };

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
    if (name.length > APPLICANT_NAME_MAX_CHARS) {
      fail(`Please keep your name under ${APPLICANT_NAME_MAX_CHARS} characters.`);
      return;
    }

    const emailError = validateUniEmail(email);
    if (emailError) {
      fail(emailError);
      return;
    }

    // Every question is mandatory. Validated with the same function the server
    // uses, so the two can't disagree about what's acceptable.
    const nextFieldErrors: Record<string, string> = {};
    for (const question of questions) {
      const message = validateAnswer(question, answers[question.id] ?? "");
      if (message) nextFieldErrors[question.id] = message;
    }
    setFieldErrors(nextFieldErrors);

    const missingCv = !cv;
    setCvError(missingCv ? "Please attach your CV as a PDF." : "");

    if (Object.keys(nextFieldErrors).length > 0 || missingCv) {
      fail("Please answer every question and attach your CV before submitting.");
      return;
    }

    if (!captchaToken) {
      fail("Please tick the captcha box.");
      return;
    }

    submitting();

    const trimmedAnswers = Object.fromEntries(
      questions.map((question) => [question.id, (answers[question.id] ?? "").trim()]),
    );

    const result = await submitApplication({
      eventId,
      token: captchaToken,
      name,
      email: normaliseEmail(email),
      answers: trimmedAnswers,
      questionsFingerprint: fingerprint,
      cv: cv!,
    });
    resetCaptcha();

    if (!result.ok) {
      fail(applicationErrorMessage(result));
      return;
    }

    // Everything on the receipt comes from the server's response, not from this
    // form's state, so it reflects exactly what was stored.
    succeed();
    onSubmitted(result.data.receipt, result.data.receipt_emailed);
  };

  return (
    <form
      className="contact-form r-up"
      name="event-application"
      onSubmit={onSubmit}
      onInput={onFormInput}
      noValidate
      style={{ marginTop: 24, maxWidth: 560 }}
    >
      <p className="hidden-field">
        <label>
          Don't fill this out if you're human: <input name="bot-field" tabIndex={-1} autoComplete="off" />
        </label>
      </p>

      <div className="field">
        <label htmlFor="app-name">Full name *</label>
        <input id="app-name" name="name" type="text" autoComplete="name" required maxLength={APPLICANT_NAME_MAX_CHARS} />
      </div>
      <UniEmailField id="app-email" />

      {questions.map((question, index) => (
        <QuestionField
          key={question.id}
          question={question}
          index={index}
          value={answers[question.id] ?? ""}
          onChange={(value) => setAnswer(question.id, value)}
          error={fieldErrors[question.id]}
        />
      ))}

      <CvField
        id="app-cv"
        file={cv}
        onChange={(file) => {
          setCv(file);
          if (file) setCvError("");
        }}
        error={cvError}
      />

      <p className="field-hint">
        Your CV is used only to review this application. It's stored privately, is visible only to the
        MUTIS committee, and is deleted {CV_RETENTION_DAYS} days after the event. See our{" "}
        <Link to="/privacy" target="_blank" rel="noreferrer">
          Privacy Policy
        </Link>{" "}
        for how we handle your data.
      </p>

      <PrivacyConsent id="app-consent-privacy" />
      <Captcha {...captchaProps} />
      <FormFeedback status={status} error={error} />

      <button
        className="btn btn-primary"
        type="submit"
        disabled={status === "submitting" || !captchaToken}
        aria-busy={status === "submitting"}
        style={{ alignSelf: "flex-start" }}
      >
        {status === "submitting" ? "Submitting…" : "Submit application"}
        <span className="arrow" />
      </button>
    </form>
  );
}
