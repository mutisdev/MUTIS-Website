import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { CAPTCHA_FAILED_MESSAGE } from "@/app/hooks/useCaptcha";

export type PublicFormName = "contact" | "sponsorship" | "event_signup" | "attendance" | "membership" | "alumni";

/**
 * Why a submission failed. Server codes come from the `submit-form` Edge
 * Function's response body; the rest are decided here, in the browser:
 * - network: the request never got a response (after one retry). Nothing is
 *   in the function logs for these.
 * - timeout: no response within REQUEST_TIMEOUT_MS.
 * - relay: Supabase's gateway failed before reaching the function.
 * - unreadable_response: the function answered 2xx but the reply couldn't be
 *   read, so the submission was most likely saved.
 * - http_<status>: an error status whose body wasn't the function's JSON.
 */
export type SubmitFormErrorCode =
  | "captcha_failed"
  | "duplicate"
  | "invalid"
  | "bad_request"
  | "unknown_form"
  | "unexpected_file"
  | "captcha_unavailable"
  | "db_error"
  | "internal"
  | "network"
  | "timeout"
  | "relay"
  | "unreadable_response"
  | `http_${number}`;

export type SubmitFormFailure = {
  ok: false;
  code: SubmitFormErrorCode;
  /** Server-provided explanation, shown as-is for `invalid`. */
  message?: string;
  /** Narrows `code` (e.g. Postgres error code, reCAPTCHA error codes, the browser's fetch error). */
  detail?: string;
};

export type SubmitFormResult = { ok: true } | SubmitFormFailure;

const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_000;

const SERVER_CODES = new Set<string>([
  "captcha_failed",
  "duplicate",
  "invalid",
  "bad_request",
  "unknown_form",
  "unexpected_file",
  "captcha_unavailable",
  "db_error",
  "internal",
]);

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
  const buildBody = () => {
    if (!photo) return { form, token, payload };
    const body = new FormData();
    body.append("form", form);
    body.append("token", token);
    body.append("payload", JSON.stringify(payload));
    body.append("photo", photo, "photo.jpeg");
    return body;
  };

  let result = await invokeOnce(form, buildBody());
  if (!result.ok && result.code === "network") {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    result = await invokeOnce(form, buildBody());
  }
  return result;
}

async function invokeOnce(form: PublicFormName, body: Record<string, unknown> | FormData): Promise<SubmitFormResult> {
  const { error } = await supabase.functions.invoke("submit-form", { body, timeout: REQUEST_TIMEOUT_MS });
  if (!error) return { ok: true };

  const failure = await classify(error);
  console.error(`Failed to submit ${form} form [${formatErrorRef(failure)}]`, error);
  return failure;
}

async function classify(error: unknown): Promise<SubmitFormFailure> {
  if (error instanceof FunctionsHttpError) {
    const response: Response = error.context;
    try {
      const data: { code?: string; error?: string; detail?: string } = await response.json();
      if (data.code && SERVER_CODES.has(data.code)) {
        return { ok: false, code: data.code as SubmitFormErrorCode, message: data.error, detail: data.detail };
      }
    } catch {
      // Not the function's JSON (e.g. a gateway error page): fall through.
    }
    return { ok: false, code: `http_${response.status}` };
  }

  if (error instanceof FunctionsRelayError) {
    const response: Response = error.context;
    return { ok: false, code: "relay", detail: String(response.status) };
  }

  if (error instanceof FunctionsFetchError) {
    const cause = error.context;
    if (cause instanceof DOMException && cause.name === "AbortError") return { ok: false, code: "timeout" };
    return { ok: false, code: "network", detail: describeCause(cause) };
  }

  // invoke wraps every fetch failure and non-2xx status above, so anything
  // else was thrown while reading a successful response.
  return { ok: false, code: "unreadable_response", detail: describeCause(error) };
}

/** The browser's own wording ("Load failed" in Safari, "Failed to fetch" in Chrome), trimmed. */
function describeCause(cause: unknown): string | undefined {
  const message = cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined;
  return message?.slice(0, 80) || undefined;
}

/** Short reference shown to visitors and logged, e.g. "db_error/23503" or "network/Load failed". */
export function formatErrorRef(failure: SubmitFormFailure): string {
  return failure.detail ? `${failure.code}/${failure.detail}` : failure.code;
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
