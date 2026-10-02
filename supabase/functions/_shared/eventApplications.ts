// Everything both sides need to agree on for event application mode (events
// with requires_application = true): limits, question shapes, CV validation.
//
// Imported by the submit-application and purge-event-cvs Edge Functions (Deno)
// and by the website (via the `@shared` alias in vite.config.ts /
// tsconfig.json), so — like uniEmail.ts and eventStatus.ts — it must stay plain
// TypeScript with no imports and no Deno or DOM APIs.

/** Private bucket holding applicants' CVs. Never public; admins read it
 * through short-lived signed URLs only. */
export const CV_BUCKET = "event-cvs";

/**
 * How long a CV is kept after its event starts. THIS IS THE ONLY PLACE THIS
 * NUMBER LIVES. purge-event-cvs computes its cut-off from it, the public
 * privacy notice quotes it, and the admin page explains it; the pg_cron
 * schedule only says how often to sweep, never how old is too old, so changing
 * the value here is enough.
 */
export const CV_RETENTION_DAYS = 90;

/** Client-side guard and the authoritative server-side guard both use this.
 * The bucket's own file_size_limit is set to match, as a backstop. */
export const CV_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Lifetime of an admin's signed CV URL. An hour, because reviewing is done in
 * sittings: the committee opens a CV, reads it alongside the answers, goes back,
 * opens the next one, and may well return to an earlier tab. A link that died
 * after a minute meant re-requesting it constantly, which is friction with no
 * security benefit worth having — the link is unguessable, it only reaches one
 * applicant's PDF, and every access is recorded in the audit log either way.
 *
 * Note this is the life of the LINK, not of the file: the CV itself stays in
 * storage until CV_RETENTION_DAYS passes, so it can be reopened and downloaded
 * freely in the meantime.
 */
export const CV_SIGNED_URL_SECONDS = 60 * 60;

export const MAX_QUESTION_PROMPT_CHARS = 300;
export const MAX_CHOICE_OPTION_CHARS = 120;
export const MAX_CHOICE_OPTIONS = 20;
export const MAX_ANSWER_CHARS = 2000;
export const MAX_QUESTIONS_PER_EVENT = 30;
/** A single-choice question is meaningless with fewer than two options. */
export const MIN_CHOICE_OPTIONS = 2;

export const APPLICANT_NAME_MAX_CHARS = 200;
export const CV_FILE_NAME_MAX_CHARS = 255;

/**
 * Per-IP and per-(email, event) submission windows, enforced by
 * public.consume_application_rate_limit. The IP is hashed before it reaches the
 * database, so no raw visitor address is ever stored.
 */
export const RATE_LIMIT_IP = { limit: 5, windowSeconds: 60 * 60 };
export const RATE_LIMIT_EMAIL = { limit: 3, windowSeconds: 24 * 60 * 60 };

// ---- questions ----

export const QUESTION_TYPES = ["short_text", "long_text", "single_choice"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  single_choice: "Single choice",
};

export function isQuestionType(value: unknown): value is QuestionType {
  return typeof value === "string" && (QUESTION_TYPES as readonly string[]).includes(value);
}

export const APPLICATION_STATUSES = ["pending", "accepted", "waitlisted", "rejected"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return typeof value === "string" && (APPLICATION_STATUSES as readonly string[]).includes(value);
}

/** The shape both the public form and the server validate against. */
export interface ApplicationQuestion {
  id: string;
  prompt: string;
  question_type: QuestionType;
  options: string[];
  position: number;
}

/** Normalises the jsonb `options` column into a string array. The column has a
 * CHECK constraint guaranteeing an array of non-blank strings, so this is
 * about satisfying the type system, not about distrusting the database. */
export function parseQuestionOptions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((option): option is string => typeof option === "string");
}

/** What the public form and the server both consider a usable answer. The same
 * function runs in the browser for inline validation and inside
 * submit-application, so the two can't disagree about what's acceptable.
 * Every question is mandatory — there is deliberately no optional flag. */
export function validateAnswer(
  question: Pick<ApplicationQuestion, "question_type" | "options">,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return "This question needs an answer.";
  if (trimmed.length > MAX_ANSWER_CHARS) {
    return `Please keep this under ${MAX_ANSWER_CHARS} characters.`;
  }
  if (question.question_type === "single_choice" && !question.options.includes(trimmed)) {
    return "Choose one of the listed options.";
  }
  return "";
}

/**
 * Identifies the exact question set a form was rendered from, so a submission
 * built against a stale set is rejected before its CV is uploaded rather than
 * saved with missing answers. Ids are sorted, so a pure reorder doesn't
 * invalidate a form someone is part-way through filling in.
 */
export function questionsFingerprint(questions: ReadonlyArray<{ id: string }>): string {
  return questions
    .map((question) => question.id)
    .slice()
    .sort()
    .join(",");
}

// ---- CV file ----

/** Where a CV is stored. Derived from ids rather than the uploaded file name,
 * so a hostile name can't escape its event's folder. A CHECK constraint on
 * event_applications.cv_path enforces the same shape in the database. */
export function cvObjectPath(eventId: string, applicationId: string): string {
  return `${eventId}/${applicationId}.pdf`;
}

/** The uploaded name, kept only to show the applicant and the admin which file
 * was sent. Path separators and control characters are stripped: this value is
 * displayed, emailed and exported, never used to build a storage path. */
export function safeCvFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, CV_FILE_NAME_MAX_CHARS);
  return cleaned || "cv.pdf";
}

/** "412 KB" / "2.4 MB" — shared so the form, the receipt and the email agree. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// A PDF's own structure is the only thing trusted here: the browser's reported
// MIME type and the ".pdf" extension are both trivially faked. Every PDF opens
// with "%PDF-" (PDF 32000-1, 7.5.2) and carries a "%%EOF" marker at the end.
// The browser runs these checks for instant feedback; submit-application runs
// them again on the bytes it actually received, and that run is the one that
// decides.

const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const PDF_TRAILER = [0x25, 0x25, 0x45, 0x4f, 0x46]; // "%%EOF"

export const PDF_HEADER_BYTES = PDF_HEADER.length;
/** How much of the tail to search for %%EOF: the spec allows trailing
 * whitespace and some writers leave a little padding after it. */
export const PDF_TRAILER_WINDOW_BYTES = 1024;

export const CV_TYPE_ERROR = "Please choose a PDF file.";
export const CV_CORRUPT_ERROR = "That file isn't a valid PDF. Try exporting it as a PDF again.";
export const CV_SIZE_ERROR = `Your CV must be a PDF under ${formatFileSize(CV_MAX_BYTES)}.`;

/** True when the first bytes are "%PDF-". Pass at least PDF_HEADER_BYTES. */
export function hasPdfHeader(head: Uint8Array): boolean {
  if (head.length < PDF_HEADER.length) return false;
  return PDF_HEADER.every((byte, i) => head[i] === byte);
}

/** True when "%%EOF" appears anywhere in the given tail of the file. */
export function hasPdfTrailer(tail: Uint8Array): boolean {
  for (let i = 0; i + PDF_TRAILER.length <= tail.length; i++) {
    if (PDF_TRAILER.every((byte, j) => tail[i + j] === byte)) return true;
  }
  return false;
}

/** Empty and oversized files, checked before any bytes are read — so an absurd
 * declared size never makes the server materialise the whole body. */
export function cvSizeError(size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return CV_CORRUPT_ERROR;
  if (size > CV_MAX_BYTES) return CV_SIZE_ERROR;
  return null;
}

/** The structural check, over the whole file's bytes. Returns an error message
 * or null. Callers must have run cvSizeError first. */
export function cvContentError(bytes: Uint8Array): string | null {
  if (!hasPdfHeader(bytes.subarray(0, PDF_HEADER_BYTES))) return CV_TYPE_ERROR;
  if (!hasPdfTrailer(bytes.subarray(-PDF_TRAILER_WINDOW_BYTES))) return CV_CORRUPT_ERROR;
  return null;
}
