// Single source of truth for which email addresses count as a University of
// Manchester address. Imported by the submit-form Edge Function (Deno) and by
// the website (via the `@shared` alias in vite.config.ts / tsconfig.json), so
// it must stay plain TypeScript with no imports and no Deno or DOM APIs.
//
// The same list is repeated as a regex in the database CHECK constraints
// (see supabase/migrations/*_normalise_emails_require_uni_domain.sql and
// *_create_member_event_attendance.sql). Change all three together.

export const UNI_EMAIL_DOMAINS = [
  "student.manchester.ac.uk",
  "postgrad.manchester.ac.uk",
  "manchester.ac.uk",
] as const;

export const UNI_EMAIL_ERROR = `Use your University of Manchester email ending in ${UNI_EMAIL_DOMAINS.slice(0, -1)
  .map((d) => `@${d}`)
  .join(", ")} or @${UNI_EMAIL_DOMAINS[UNI_EMAIL_DOMAINS.length - 1]}.`;

/** How emails are stored: trimmed and lowercased. */
export function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

/** True when the address has exactly one "@" and the part after it is one of
 * UNI_EMAIL_DOMAINS exactly (case-insensitive). Sub-domains and look-alikes
 * such as students.manchester.ac.uk or manchester.ac.uk.example.com fail. */
export function isUniEmail(value: string): boolean {
  const parts = normaliseEmail(value).split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || /\s/.test(local)) return false;
  return (UNI_EMAIL_DOMAINS as readonly string[]).includes(domain);
}
