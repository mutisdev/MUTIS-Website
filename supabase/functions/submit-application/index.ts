import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { verifyRecaptcha } from "../_shared/recaptcha.ts";
import { isUniEmail, normaliseEmail, UNI_EMAIL_ERROR } from "../_shared/uniEmail.ts";
import { hasEventEnded } from "../_shared/eventStatus.ts";
import { sendTemplatedEmail, eventEmailParams, escapeHtml } from "../_shared/sendEmail.ts";
import {
  APPLICANT_NAME_MAX_CHARS,
  CV_BUCKET,
  cvContentError,
  cvObjectPath,
  cvSizeError,
  formatFileSize,
  parseQuestionOptions,
  questionsFingerprint,
  RATE_LIMIT_EMAIL,
  RATE_LIMIT_IP,
  safeCvFileName,
  validateAnswer,
  type ApplicationQuestion,
} from "../_shared/eventApplications.ts";

// The only way an application can be created. The anon role has no INSERT on
// event_applications or application_answers and no upload on the private
// event-cvs bucket, so this function — which verifies the reCAPTCHA token,
// re-validates every answer and checks the CV's actual bytes — is the single
// write path. It mirrors submit-form (same { code, error?, detail? } error
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
const RPC_MESSAGES: Record<string, string> = {
  event_not_open: "Applications aren't open for this event.",
  questions_changed:
    "The questions for this event changed while you were filling this in. Please reload the page and submit again — sorry about that.",
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

    // ---- 3. the event must be open and in application mode ----
    const eventId = String(payload.event_id ?? "");
    if (!eventId) throw new InvalidInput("Missing field: event_id");

    const { data: event, error: eventError } = await db
      .from("events")
      .select("id, title, description, location, starts_at, ends_at, requires_application, signup_enabled")
      .eq("id", eventId)
      .eq("is_published", true)
      .maybeSingle();
    if (eventError) {
      console.error("Failed to load event", eventId, eventError);
      return json({ code: "db_error", detail: eventError.code ?? "none" }, 500);
    }
    if (!event || !event.requires_application || !event.signup_enabled) {
      throw new InvalidInput("Applications aren't open for this event.");
    }
    if (hasEventEnded(event)) {
      throw new InvalidInput("This event has already happened, so applications are closed.");
    }

    // ---- 4. applicant identity ----
    const rawName = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!rawName) throw new InvalidInput("Missing field: name");
    if (rawName.length > APPLICANT_NAME_MAX_CHARS) throw new InvalidInput("Field too long: name");

    const rawEmail = typeof payload.email === "string" ? payload.email.trim() : "";
    if (!rawEmail) throw new InvalidInput("Missing field: email");
    if (!isUniEmail(rawEmail)) throw new InvalidInput(UNI_EMAIL_ERROR);
    const email = normaliseEmail(rawEmail);

    // ---- 5. rate limit by email per event ----
    {
      const { data: allowed, error } = await db.rpc("consume_application_rate_limit", {
        p_bucket: `email:${eventId}:${email}`,
        p_limit: RATE_LIMIT_EMAIL.limit,
        p_window_seconds: RATE_LIMIT_EMAIL.windowSeconds,
      });
      if (error) console.error("Email rate limit check failed", error);
      else if (allowed === false) {
        return json({ code: "rate_limited", error: "Too many attempts for this event. Please try again later." }, 429);
      }
    }

    // ---- 6. duplicate, checked before the CV is uploaded ----
    const { data: existing } = await db
      .from("event_applications")
      .select("id")
      .eq("event_id", eventId)
      .eq("email", email)
      .maybeSingle();
    if (existing) return json({ code: "duplicate" }, 409);

    // ---- 7. the questions, and the answers against them ----
    const { data: questionRows, error: questionsError } = await db
      .from("event_questions")
      .select("id, prompt, question_type, options, position")
      .eq("event_id", eventId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (questionsError) {
      console.error("Failed to load questions", eventId, questionsError);
      return json({ code: "db_error", detail: questionsError.code ?? "none" }, 500);
    }
    const questions: ApplicationQuestion[] = (questionRows ?? []).map((row) => ({
      id: row.id,
      prompt: row.prompt,
      question_type: row.question_type,
      options: parseQuestionOptions(row.options),
      position: row.position,
    }));
    if (questions.length === 0) throw new InvalidInput("Applications aren't open for this event.");

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
    const cvPath = cvObjectPath(eventId, applicationId);

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

    const { data: result, error: rpcError } = await db.rpc("submit_event_application", {
      p_application_id: applicationId,
      p_event_id: eventId,
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
      event: { title: event.title, starts_at: event.starts_at, location: event.location },
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

    const sent = await sendTemplatedEmail({
      to: email,
      subject: `Application received: ${event.title}`,
      templateFile: "application_receipt.html",
      params: {
        ...eventEmailParams(event, rawName),
        REFERENCE_CODE: receipt.reference_code,
        APPLICANT_NAME: rawName,
        APPLICANT_EMAIL: email,
        SUBMITTED_AT: dateFormat.format(new Date(receipt.submitted_at)),
        // Name only — never a link to the CV and never the file itself, so a
        // forwarded or intercepted receipt can't reach the PDF.
        CV_FILE_NAME: `${cvFileName} (${formatFileSize(cvBytes.length)})`,
        ANSWERS_HTML: { html: answersHtml },
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
