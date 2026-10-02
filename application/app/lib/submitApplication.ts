import { CAPTCHA_FAILED_MESSAGE } from "@/app/hooks/useCaptcha";
import {
  formatErrorRef,
  invokeFunction,
  type FunctionFailure,
  type FunctionResult,
} from "@/app/lib/invokeFunction";

/** Everything the receipt screen shows, built by the Edge Function from the
 * answers it actually stored — so the screen, the email and the database row
 * can't disagree about what was submitted. */
export interface ApplicationReceiptData {
  reference_code: string;
  submitted_at: string;
  name: string;
  email: string;
  cv_file_name: string;
  cv_size_bytes: number;
  event: { title: string; starts_at: string; location: string };
  answers: { prompt: string; answer_text: string }[];
}

interface SubmitApplicationResponse {
  ok: true;
  receipt: ApplicationReceiptData;
  /** False when the receipt email couldn't be sent. The application is still
   * saved and the on-screen receipt still shows; the form mentions it so the
   * applicant doesn't sit waiting for an email that isn't coming. */
  receipt_emailed: boolean;
}

export type SubmitApplicationResult = FunctionResult<SubmitApplicationResponse>;

/**
 * Sends an application to the `submit-application` Edge Function, which
 * verifies the reCAPTCHA token, re-validates every answer, checks the CV's
 * actual bytes and inserts the application and its answers in one transaction.
 *
 * Always multipart, because there is always a CV. `questionsFingerprint`
 * identifies the question set the form was built from, so a form left open
 * while an admin edited the questions is turned away rather than saved with
 * missing answers.
 */
export async function submitApplication({
  eventId,
  token,
  name,
  email,
  answers,
  questionsFingerprint,
  cv,
}: {
  eventId: string;
  token: string;
  name: string;
  email: string;
  /** question id → answer text */
  answers: Record<string, string>;
  questionsFingerprint: string;
  cv: File;
}): Promise<SubmitApplicationResult> {
  return await invokeFunction<SubmitApplicationResponse>("submit-application", "application", () => {
    const body = new FormData();
    body.append("token", token);
    body.append(
      "payload",
      JSON.stringify({
        event_id: eventId,
        name,
        email,
        answers,
        questions_fingerprint: questionsFingerprint,
      }),
    );
    // The name is sent so the receipt can show it; the server sanitises it and
    // never uses it to build the storage path.
    body.append("cv", cv, cv.name);
    return body;
  });
}

/**
 * The message the application form shows for a failed submission. Mirrors
 * submitErrorMessage's contract: self-explanatory failures read plainly, the
 * rest carry the error reference so a screenshot is enough to find the cause.
 */
export function applicationErrorMessage(failure: FunctionFailure): string {
  const contact = "email us at mutis@manchesterstudentsunion.com";
  const withRef = (text: string) => `${text} (Error: ${formatErrorRef(failure)})`;

  switch (failure.code) {
    case "duplicate":
      return "You've already applied for this event with that email address. Check your inbox for your receipt — you don't need to apply again.";
    case "invalid":
      // Covers the questions-changed, bad-answer and bad-CV cases, each of
      // which the server explains specifically.
      return failure.message ?? withRef(`Some details weren't accepted. Please check the form and try again, or ${contact}.`);
    case "rate_limited":
      return failure.message ?? "Too many attempts just now. Please wait a little and try again.";
    case "captcha_failed":
      return withRef(CAPTCHA_FAILED_MESSAGE);
    case "storage_error":
      return withRef(`We couldn't save your CV. Please try again, or ${contact}.`);
    case "network":
      return withRef(
        "We couldn't reach our server. Check your connection and try again. If you opened this link inside Instagram or another app, open it in your browser instead (tap ⋯ → Open in browser).",
      );
    case "timeout":
      return withRef(`Our server took too long to respond. Please try again, or ${contact}.`);
    case "unreadable_response":
      return withRef(
        `Your application was probably received, but we couldn't confirm it. Please don't resubmit — check your inbox for a receipt, and if there isn't one, ${contact}.`,
      );
    default:
      return withRef(`Something went wrong on our side. Please try again, or ${contact}.`);
  }
}
