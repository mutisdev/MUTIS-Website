// An event can hand its sign-up to another site — a partner firm's portal,
// Eventbrite, a Google Form — by carrying an external_url. Everything both the
// admin drawer and the public pages need to agree on about that URL lives
// here: the length cap, what counts as valid, and the host shown on the
// outbound button.
//
// Kept in step with the events_external_url_shape CHECK in
// 20261025120000_events_external_signup_url.sql. The constraint is the real
// guarantee; this is the message an admin reads before hitting it.

/** The admin field's cap, enforced again by the events_external_url_shape CHECK. */
export const MAX_EXTERNAL_URL_LENGTH = 2048;

/**
 * Validation for the admin field. Returns an error message, or null when the
 * value is a usable link. A blank value is valid: it means "no external link",
 * which is the normal in-house sign-up.
 */
export function validateExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_EXTERNAL_URL_LENGTH) {
    return `That link is too long — keep it under ${MAX_EXTERNAL_URL_LENGTH} characters.`;
  }
  // Tested before parsing: new URL() happily accepts http:, mailto: and
  // javascript:, and only the scheme check keeps those out.
  if (!/^https:\/\//.test(trimmed)) {
    return "The link has to start with https:// so it opens as a secure page.";
  }
  if (/[\s]/.test(trimmed)) {
    return "The link can't contain spaces — paste just the URL.";
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return "That doesn't look like a complete link. Paste the whole URL, including https://.";
  }
  if (!parsed.hostname.includes(".")) {
    return "That link is missing a domain, e.g. https://www.eventbrite.co.uk/e/…";
  }
  return null;
}

/**
 * The host shown to the public, so the outbound button says where it goes
 * before anyone clicks it. "www." is dropped because it tells a reader
 * nothing. Returns null for anything unparseable, which the callers render as
 * a plain "Register externally" instead of guessing.
 */
export function externalUrlHost(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
