import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyRecaptcha } from "../_shared/recaptcha.ts";
import { isUniEmail, normaliseEmail, UNI_EMAIL_ERROR } from "../_shared/uniEmail.ts";
import { hasEventEnded } from "../_shared/eventStatus.ts";
import { hasPositionClosed } from "../_shared/positionStatus.ts";
import {
  sendTemplatedEmail,
  eventEmailParams,
  eventDetailRows,
  positionDetailRows,
  escapeHtml,
  LOGO_URL,
  SITE_URL,
} from "../_shared/sendEmail.ts";
import {
  APPLICANT_NAME_MAX_CHARS,
  CV_BUCKET,
  cvContentError,
  cvObjectPath,
  cvSizeError,
  emailRateLimitBucket,
  formatFileSize,
  parseQuestionOptions,
  questionsFingerprint,
  RATE_LIMIT_EMAIL,
  RATE_LIMIT_IP,
  safeCvFileName,
  validateAnswer,
  type ApplicationQuestion,
  type ApplicationTarget,
} from "../_shared/eventApplications.ts";

// The only way an application can be created, for either kind of target: an
// event in application mode, or a position listing on the Opportunities page.
// The anon role has no INSERT on event_applications or application_answers and
// no upload on the private event-cvs bucket, so this function — which verifies
// the reCAPTCHA token, re-validates every answer and checks the CV's actual
// bytes — is the single write path. It mirrors submit-form (same { code, error?, detail? } error
// shape) but is separate from it because this flow has to allocate an id,
// upload a file, call an RPC and return a receipt, none of which fit
// submit-form's `(db, payload, photo) => { error }` handler contract.
//
// Deliberate ordering note: the rate-limit check runs BEFORE the captcha
// verification, the opposite of submit-form. A captcha check is an outbound
// request to Google on our quota, so letting an unthrottled caller trigger one
// per request would make this function an amplifier.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

class InvalidInput extends Error {}

/** Errors the RPC raises by name, mapped to what the visitor is told. Anything
 * else from Postgres is a db_error with only its code exposed. */
// NOTE: matched by SUBSTRING below, so no key may ever be a substring of
// another. event_not_open and position_not_open are safe together because
// neither contains the other; a bare `not_open` would break both.
const RPC_MESSAGES: Record<string, string> = {
  event_not_open: "Applications aren't open for this event.",
  position_not_open: "Applications aren't open for this opportunity.",
  questions_changed:
    "The questions changed while you were filling this in. Please reload the page and submit again — sorry about that.",
  invalid_answer: "One of your answers was empty or too long. Please check the form and try again.",
  invalid_choice: "One of your answers wasn't one of the listed options. Please reload the page and try again.",
};

/** Hashed so the rate-limit table never holds a visitor's IP address. */
async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);

  // Always multipart: there is always a CV. (submit-form prefers JSON because
  // some in-app browsers mishandle multipart, but there is no fileless variant
  // of this request to fall back to.)
  let token: string;
  let payload: Record<string, unknown>;
  let cv: File | null = null;
  try {
    const body = await req.formData();
    token = String(body.get("token") ?? "");
    payload = JSON.parse(String(body.get("payload") ?? "{}"));
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("payload");
    const cvField = body.get("cv");
    if (cvField instanceof File) cv = cvField;
  } catch (err) {
    console.warn("Unreadable request body", req.headers.get("content-type"), err);
    return json({ code: "bad_request", error: "Invalid request body" }, 400);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";

  try {
    // ---- 1. rate limit by IP, before anything expensive ----
    if (remoteIp) {
      const { data: allowed, error } = await db.rpc("consume_application_rate_limit", {
        p_bucket: `ip:${await hashIp(remoteIp)}`,
        p_limit: RATE_LIMIT_IP.limit,
        p_window_seconds: RATE_LIMIT_IP.windowSeconds,
      });
      // Fail open on a limiter failure: losing the limiter shouldn't take the
      // form down. The captcha and the duplicate index still apply.
      if (error) console.error("IP rate limit check failed", error);
      else if (allowed === false) {
        return json({ code: "rate_limited", error: "Too many applications from this connection. Please try again later." }, 429);
      }
    }

    // ---- 2. captcha ----
    try {
      const captcha = await verifyRecaptcha(token, remoteIp || undefined);
      if (!captcha.ok) {
        console.warn("reCAPTCHA rejected application", captcha.errorCodes);
        return json({ code: "captcha_failed", detail: captcha.errorCodes.join(",") }, 400);
      }
    } catch (err) {
      console.error("reCAPTCHA verification error", err);
      return json({ code: "captcha_unavailable" }, 502);
    }

    // ---- 3. the target must exist and be open for applications ----
    // Exactly one of event_id / position_id, mirroring the one_target CHECK
    // constraints and submit_application's own first check.
    const eventId = String(payload.event_id ?? "");
    const positionId = String(payload.position_id ?? "");
    if (!eventId && !positionId) throw new InvalidInput("Missing field: event_id");
    if (eventId && positionId) throw new InvalidInput("Specify one of event_id or position_id");

    const target: ApplicationTarget = eventId
      ? { kind: "event", id: eventId }
      : { kind: "position", id: positionId };

    // The loaded parent row, one branch or the other. Kept in separate consts
    // rather than a union so the receipt and the email can read the fields
    // each kind actually has without casting.
    let event: {
      id: string;
      title: string;
      description: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
    } | null = null;
    let position: {
      id: string;
      title: string;
      description: string | null;
      category: string;
      closes_at: string | null;
    } | null = null;

    if (target.kind === "event") {
      const { data, error: eventError } = await db
        .from("events")
        .select("id, title, description, location, starts_at, ends_at, requires_application, signup_enabled")
        .eq("id", target.id)
        .eq("is_published", true)
        .maybeSingle();
      if (eventError) {
        console.error("Failed to load event", target.id, eventError);
        return json({ code: "db_error", detail: eventError.code ?? "none" }, 500);
      }
      if (!data || !data.requires_application || !data.signup_enabled) {
        throw new InvalidInput("Applications aren't open for this event.");
      }
      if (hasEventEnded(data)) {
        throw new InvalidInput("This event has already happened, so applications are closed.");
      }
      event = data;
    } else {
      const { data, error: positionError } = await db
        .from("positions")
        .select("id, title, description, category, closes_at, applications_open")
        .eq("id", target.id)
        .eq("is_published", true)
        .maybeSingle();
      if (positionError) {
        console.error("Failed to load position", target.id, positionError);
        return json({ code: "db_error", detail: positionError.code ?? "none" }, 500);
      }
      // The same predicate the RLS policy and submit_application use:
      // is_published (filtered above), applications_open, and not past
      // closes_at — via the shared helper, so the three can't disagree.
      if (!data || !data.applications_open) {
        throw new InvalidInput("Applications aren't open for this opportunity.");
      }
      if (hasPositionClosed(data)) {
        throw new InvalidInput("Applications for this opportunity have closed.");
      }
      position = data;
    }

    // What the subject line and the receipt call it.
    const targetTitle = event?.title ?? position?.title ?? "";

    // ---- 4. applicant identity ----
    const rawName = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!rawName) throw new InvalidInput("Missing field: name");
    if (rawName.length > APPLICANT_NAME_MAX_CHARS) throw new InvalidInput("Field too long: name");

    const rawEmail = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!rawEmail) throw new InvalidInput("Missing field: email");
    if (!isUniEmail(rawEmail)) throw new InvalidInput(UNI_EMAIL_ERROR);
    const email = normaliseEmail(rawEmail);

    // ---- 5. rate limit by email per target ----
    {
      const { data: allowed, error } = await db.rpc("consume_application_rate_limit", {
        // Shared builder, so the event bucket string stays byte-identical to
        // the one already in use and live counters aren't reset.
        p_bucket: emailRateLimitBucket(target, email),
        p_limit: RATE_LIMIT_EMAIL.limit,
        p_window_seconds: RATE_LIMIT_EMAIL.windowSeconds,
      });
      if (error) console.error("Email rate limit check failed", error);
      else if (allowed === false) {
        return json({ code: "rate_limited", error: "Too many attempts for this application. Please try again later." }, 429);
      }
    }

    // Which of the two parent columns this submission is keyed by. Used by the
    // duplicate check, the question lookup and the RPC call below.
    const targetColumn = target.kind === "event" ? "event_id" : "position_id";

    // ---- 6. duplicate, checked before the CV is uploaded ----
    const { data: existing } = await db
      .from("event_applications")
      .select("id")
      .eq(targetColumn, target.id)
      .eq("email", email)
      .maybeSingle();
    if (existing) return json({ code: "duplicate" }, 409);

    // ---- 7. the questions, and the answers against them ----
    const { data: questionRows, error: questionsError } = await db
      .from("event_questions")
      .select("id, prompt, question_type, options, position")
      .eq(targetColumn, target.id)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (questionsError) {
      console.error("Failed to load questions", target.kind, target.id, questionsError);
      return json({ code: "db_error", detail: questionsError.code ?? "none" }, 500);
    }
    const questions: ApplicationQuestion[] = (questionRows ?? []).map((row) => ({
      id: row.id,
      prompt: row.prompt,
      question_type: row.question_type,
      options: parseQuestionOptions(row.options),
      position: row.position,
    }));
    // Application mode with no questions isn't a usable form; treated as closed
    // here, in the RPC and on the page. For a position this is the whole of the
    // "is there a form" gate, which is why that table has no
    // requires_application column.
    if (questions.length === 0) {
      throw new InvalidInput(
        target.kind === "event"
          ? "Applications aren't open for this event."
          : "Applications aren't open for this opportunity.",
      );
    }

    // The form says which question set it was built from. Checking it here means
    // a stale form is turned away before its CV is uploaded, rather than after.
    // The RPC repeats the check inside its transaction to close the remaining
    // race; this is the cheap early exit.
    const fingerprint = typeof payload.questions_fingerprint === "string" ? payload.questions_fingerprint : "";
    if (fingerprint !== questionsFingerprint(questions)) {
      return json({ code: "invalid", error: RPC_MESSAGES.questions_changed }, 400);
    }

    const submittedAnswers = payload.answers;
    if (typeof submittedAnswers !== "object" || submittedAnswers === null || Array.isArray(submittedAnswers)) {
      throw new InvalidInput("Missing field: answers");
    }
    const answerMap = submittedAnswers as Record<string, unknown>;

    const answers = questions.map((question) => {
      const raw = answerMap[question.id];
      const value = typeof raw === "string" ? raw : "";
      // The same validator the browser ran, so the two can't disagree.
      const message = validateAnswer(question, value);
      if (message) throw new InvalidInput(`${question.prompt}: ${message}`);
      return { question_id: question.id, answer_text: value.trim() };
    });
    // Anything addressed to a question that isn't on this event's form.
    if (Object.keys(answerMap).some((id) => !questions.some((question) => question.id === id))) {
      return json({ code: "invalid", error: RPC_MESSAGES.questions_changed }, 400);
    }

    // ---- 8. the CV, by its bytes ----
    if (!cv) throw new InvalidInput("Please attach your CV as a PDF.");
    // Size first, so a hostile declared length never makes us materialise the body.
    const declaredSizeError = cvSizeError(cv.size);
    if (declaredSizeError) throw new InvalidInput(declaredSizeError);

    const cvBytes = new Uint8Array(await cv.arrayBuffer());
    // The declared size isn't trusted either — re-check what actually arrived.
    const actualSizeError = cvSizeError(cvBytes.length);
    if (actualSizeError) throw new InvalidInput(actualSizeError);

    const contentError = cvContentError(cvBytes);
    if (contentError) throw new InvalidInput(contentError);

    const cvFileName = safeCvFileName(cv.name);

    // ---- 9. upload, then insert atomically ----
    const applicationId = crypto.randomUUID();
    const cvPath = cvObjectPath(target, applicationId);

    const { error: uploadError } = await db.storage.from(CV_BUCKET).upload(cvPath, cvBytes, {
      // The browser's File.type is discarded: it's attacker-controlled, and the
      // bucket's allowed_mime_types would otherwise be trivially bypassed.
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) {
      console.error("Failed to upload CV", cvPath, uploadError);
      return json({ code: "storage_error" }, 500);
    }

    const { data: result, error: rpcError } = await db.rpc("submit_application", {
      p_application_id: applicationId,
      p_event_id: target.kind === "event" ? target.id : null,
      p_position_id: target.kind === "position" ? target.id : null,
      p_name: rawName,
      p_email: email,
      p_cv_path: cvPath,
      p_cv_file_name: cvFileName,
      p_cv_size_bytes: cvBytes.length,
      p_answers: answers,
    });

    if (rpcError) {
      // Nothing references the object now, so take it back out. If this remove
      // also fails the file is unreachable (no row points at it) and the
      // retention sweep won't find it either, so it's logged loudly.
      const { error: removeError } = await db.storage.from(CV_BUCKET).remove([cvPath]);
      if (removeError) {
        console.error("ORPHANED CV: insert failed and cleanup failed", cvPath, removeError);
      }
      const raised = (rpcError.message ?? "").trim();
      const known = Object.keys(RPC_MESSAGES).find((key) => raised.includes(key));
      if (known) return json({ code: "invalid", error: RPC_MESSAGES[known] }, 400);
      if (rpcError.code === "23505") return json({ code: "duplicate" }, 409);
      console.error("Failed to insert application", applicationId, rpcError);
      return json({ code: "db_error", detail: rpcError.code ?? "none" }, 500);
    }

    const receipt = {
      reference_code: String((result as Record<string, unknown>)?.reference_code ?? ""),
      submitted_at: String((result as Record<string, unknown>)?.submitted_at ?? new Date().toISOString()),
      name: rawName,
      email,
      cv_file_name: cvFileName,
      cv_size_bytes: cvBytes.length,
      // Discriminated, so the receipt screen renders only the fields this kind
      // of target actually has.
      target:
        target.kind === "event"
          ? {
              kind: "event" as const,
              title: event!.title,
              starts_at: event!.starts_at,
              location: event!.location,
            }
          : {
              kind: "position" as const,
              title: position!.title,
              category: position!.category,
              closes_at: position!.closes_at,
            },
      // DEPRECATED, and kept deliberately: the receipt shape this function
      // returned before positions existed. A browser that loaded the site
      // before the matching frontend shipped reads `receipt.event`, and a
      // cached bundle can outlive this deploy by as long as someone leaves a
      // tab open — so dropping it would crash the receipt screen for an
      // applicant who had already submitted successfully.
      //
      // Only ever set for an event: no pre-positions frontend can reach a
      // position, because it has no route to one.
      //
      // Safe to delete once no cached bundle predating the Opportunities
      // release can still be in use.
      ...(target.kind === "event"
        ? { event: { title: event!.title, starts_at: event!.starts_at, location: event!.location } }
        : {}),
      // Built from the question snapshot, so the on-screen receipt, the email
      // and the stored answers are all the same list in the same order.
      answers: questions.map((question, index) => ({
        prompt: question.prompt,
        answer_text: answers[index].answer_text,
      })),
    };

    // ---- 10. receipt email (soft failure by design) ----
    // sendTemplatedEmail never throws and returns false on a missing
    // BREVO_API_KEY or a Brevo rejection, logging either. The receipt is
    // already saved and is returned below regardless, so incomplete sender
    // setup can't cost an applicant their application or their confirmation.
    const answersHtml = receipt.answers
      .map(
        (answer) =>
          `<tr><td style="padding:10px 0 2px; font-size:13px; color:#666666;">${escapeHtml(answer.prompt)}</td></tr>` +
          `<tr><td style="padding:0 0 10px; font-size:14px; line-height:1.6; color:#0B2545; white-space:pre-wrap;">${escapeHtml(answer.answer_text)}</td></tr>`,
      )
      .join("");

    // One template for both kinds, with the rows that differ supplied as a
    // pre-escaped block. The shared parts — the "not a confirmed place" panel,
    // the reference/name/email/CV table, the answers and the privacy footer —
    // therefore can't drift apart. eventEmailParams is left untouched because
    // the confirmation and reminder emails share it; the event path still calls
    // it and renders byte-identically to before.
    const commonParams = {
      REFERENCE_CODE: receipt.reference_code,
      APPLICANT_NAME: rawName,
      APPLICANT_EMAIL: email,
      SUBMITTED_AT: dateFormat.format(new Date(receipt.submitted_at)),
      // Name only — never a link to the CV and never the file itself, so a
      // forwarded or intercepted receipt can't reach the PDF.
      CV_FILE_NAME: `${cvFileName} (${formatFileSize(cvBytes.length)})`,
      ANSWERS_HTML: { html: answersHtml },
    };

    const sent = await sendTemplatedEmail({
      to: email,
      subject: `Application received: ${targetTitle}`,
      templateFile: "application_receipt.html",
      params:
        target.kind === "event"
          ? {
              ...eventEmailParams(event!, rawName),
              TARGET_LABEL: "Event",
              CTA_LABEL: "View event details",
              DETAIL_ROWS: eventDetailRows(event!),
              ...commonParams,
            }
          : {
              LOGO_URL,
              EVENT_NAME: position!.title,
              TARGET_LABEL: "Opportunity",
              CTA_LABEL: "View opportunities",
              EVENT_URL: `${SITE_URL}/opportunities`,
              DETAIL_ROWS: positionDetailRows(position!),
              ...commonParams,
            },
    });
    if (!sent) console.error("Application receipt email not sent", receipt.reference_code);

    return json({ ok: true, receipt, receipt_emailed: sent }, 200);
  } catch (err) {
    if (err instanceof InvalidInput) return json({ code: "invalid", error: err.message }, 400);
    console.error("Unexpected error handling application", err);
    return json({ code: "internal", detail: err instanceof Error ? err.name : typeof err }, 500);
  }
});
