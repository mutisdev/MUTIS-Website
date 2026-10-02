import { CAPTCHA_FAILED_MESSAGE } from "@/app/hooks/useCaptcha";
import {
  formatErrorRef,
  invokeFunction,
  type FunctionFailure,
  type FunctionResult,
} from "@/app/lib/invokeFunction";

export type PublicFormName = "contact" | "sponsorship" | "event_signup" | "attendance" | "membership" | "alumni";

// The transport, the error taxonomy and the retry behaviour now live in
// invokeFunction.ts, shared with submitApplication.ts. These aliases are kept
// so the existing names still mean what they always did at the call sites.
export type SubmitFormErrorCode = FunctionFailure["code"];
export type SubmitFormFailure = FunctionFailure;
export type SubmitFormResult = FunctionResult;

export { formatErrorRef };

/**
 * Sends a public form submission to the `submit-form` Edge Function, which
 * verifies the reCAPTCHA token before inserting. Direct inserts from the
 * browser are no longer permitted by RLS.
 *
 * The body is JSON unless there's a photo: Instagram's in-app browser on iOS
 * has been seen failing multipart requests before they leave the device.
 * A request that never reached the server is retried once. Its captcha token
 * was never used, so the retry can reuse it.
 */
export async function submitForm(
  form: PublicFormName,
  token: string,
  payload: Record<string, unknown>,
  photo?: Blob | null
): Promise<SubmitFormResult> {
  return await invokeFunction("submit-form", `${form} form`, () => {
    if (!photo) return { form, token, payload };
    const body = new FormData();
    body.append("form", form);
    body.append("token", token);
    body.append("payload", JSON.stringify(payload));
    body.append("photo", photo, "photo.jpeg");
    return body;
  });
}

/**
 * The message a form shows for a failed submission. Every message except the
 * self-explanatory ones (duplicate, invalid) ends with the error reference, so
 * a screenshot from a visitor is enough to find the cause.
 *
 * `contact` finishes the sentence "…please try again, or <contact>."
 */
export function submitErrorMessage(
  failure: SubmitFormFailure,
  { contact, duplicate }: { contact: string; duplicate?: string }
): string {
  const withRef = (text: string) => `${text} (Error: ${formatErrorRef(failure)})`;

  switch (failure.code) {
    case "duplicate":
      return duplicate ?? "We've already received this submission.";
    case "invalid":
      return failure.message ?? withRef(`Some details weren't accepted. Please check the form and try again, or ${contact}.`);
    case "captcha_failed":
      return withRef(CAPTCHA_FAILED_MESSAGE);
    case "rate_limited":
      return failure.message ?? "Too many attempts just now. Please wait a little and try again.";
    case "network":
      return withRef(
        "We couldn't reach our server. Check your connection and try again. If you opened this link inside Instagram or another app, open it in your browser instead (tap ⋯ → Open in browser)."
      );
    case "timeout":
      return withRef(`Our server took too long to respond. Please try again, or ${contact}.`);
    case "unreadable_response":
      return withRef(`Your submission was probably received, but we couldn't confirm it. Please don't resubmit. If you're unsure, ${contact}.`);
    default:
      return withRef(`Something went wrong on our side. Please try again, or ${contact}.`);
  }
}
