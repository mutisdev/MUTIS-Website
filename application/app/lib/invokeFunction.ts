import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

// How the website talks to an Edge Function that accepts a public submission,
// and how it works out what went wrong. Extracted from submitForm.ts when
// submit-application was added: both functions answer with the same
// { code, error?, detail? } body and both need the same timeout, single retry
// and error classification, so the taxonomy lives here once rather than being
// copied and slowly drifting.

/**
 * Why a submission failed. Server codes come from the Edge Function's response
 * body; the rest are decided here, in the browser:
 * - network: the request never got a response (after one retry). Nothing is
 *   in the function logs for these.
 * - timeout: no response within REQUEST_TIMEOUT_MS.
 * - relay: Supabase's gateway failed before reaching the function.
 * - unreadable_response: the function answered 2xx but the reply couldn't be
 *   read, so the submission was most likely saved.
 * - http_<status>: an error status whose body wasn't the function's JSON.
 */
export type FunctionErrorCode =
  | "captcha_failed"
  | "duplicate"
  | "invalid"
  | "bad_request"
  | "unknown_form"
  | "unexpected_file"
  | "captcha_unavailable"
  | "db_error"
  | "internal"
  // submit-application only
  | "rate_limited"
  | "storage_error"
  | "network"
  | "timeout"
  | "relay"
  | "unreadable_response"
  | `http_${number}`;

export type FunctionFailure = {
  ok: false;
  code: FunctionErrorCode;
  /** Server-provided explanation, shown as-is for `invalid`. */
  message?: string;
  /** Narrows `code` (e.g. Postgres error code, reCAPTCHA error codes, the browser's fetch error). */
  detail?: string;
};

export type FunctionSuccess<T> = { ok: true; data: T };
export type FunctionResult<T = undefined> = FunctionSuccess<T> | FunctionFailure;

export const REQUEST_TIMEOUT_MS = 20_000;
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
  "rate_limited",
  "storage_error",
]);

/**
 * Posts to an Edge Function, retrying once if the request never reached the
 * server. `buildBody` is called per attempt rather than taken as a value,
 * because a FormData holding a File can't safely be reused across fetches.
 * A retried request's captcha token was never spent, so reusing it is fine.
 */
export async function invokeFunction<T = undefined>(
  functionName: string,
  label: string,
  buildBody: () => Record<string, unknown> | FormData,
): Promise<FunctionResult<T>> {
  let result = await invokeOnce<T>(functionName, label, buildBody());
  if (!result.ok && result.code === "network") {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    result = await invokeOnce<T>(functionName, label, buildBody());
  }
  return result;
}

async function invokeOnce<T>(
  functionName: string,
  label: string,
  body: Record<string, unknown> | FormData,
): Promise<FunctionResult<T>> {
  const { data, error } = await supabase.functions.invoke(functionName, { body, timeout: REQUEST_TIMEOUT_MS });
  if (!error) return { ok: true, data: data as T };

  const failure = await classify(error);
  console.error(`Failed to submit ${label} [${formatErrorRef(failure)}]`, error);
  return failure;
}

async function classify(error: unknown): Promise<FunctionFailure> {
  if (error instanceof FunctionsHttpError) {
    const response: Response = error.context;
    try {
      const data: { code?: string; error?: string; detail?: string } = await response.json();
      if (data.code && SERVER_CODES.has(data.code)) {
        return { ok: false, code: data.code as FunctionErrorCode, message: data.error, detail: data.detail };
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
export function formatErrorRef(failure: FunctionFailure): string {
  return failure.detail ? `${failure.code}/${failure.detail}` : failure.code;
}
