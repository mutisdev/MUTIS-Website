// Server-side verification of a Google reCAPTCHA v2 checkbox token.
// RECAPTCHA_SECRET_KEY is set with `supabase secrets set` and must never
// appear in the frontend or in any committed file.

const SITEVERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";

const DEFAULT_ALLOWED_HOSTNAMES = ["mutisfinancesociety.com", "www.mutisfinancesociety.com", "localhost"];

export interface RecaptchaResult {
  ok: boolean;
  errorCodes: string[];
}

function allowedHostnames(): string[] {
  const raw = Deno.env.get("RECAPTCHA_ALLOWED_HOSTNAMES");
  if (!raw) return DEFAULT_ALLOWED_HOSTNAMES;
  return raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export async function verifyRecaptcha(token: string, remoteIp?: string | null): Promise<RecaptchaResult> {
  const secret = Deno.env.get("RECAPTCHA_SECRET_KEY");
  // Fail closed: a missing secret is a deployment error, not a pass.
  if (!secret) throw new Error("RECAPTCHA_SECRET_KEY is not configured");
  if (!token) return { ok: false, errorCodes: ["missing-input-response"] };

  const params = new URLSearchParams({ secret, response: token });
  if (remoteIp) params.set("remoteip", remoteIp);

  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) return { ok: false, errorCodes: [`siteverify-http-${res.status}`] };

  const data: { success?: boolean; hostname?: string; "error-codes"?: string[] } = await res.json();
  const errorCodes = data["error-codes"] ?? [];
  if (!data.success) return { ok: false, errorCodes };

  // Google's test keys report hostname "testkey.google.com"; allow it only
  // when explicitly listed in RECAPTCHA_ALLOWED_HOSTNAMES for local testing.
  const hostname = data.hostname?.toLowerCase() ?? "";
  if (!allowedHostnames().includes(hostname)) {
    return { ok: false, errorCodes: [...errorCodes, `hostname-not-allowed:${hostname}`] };
  }

  return { ok: true, errorCodes };
}
