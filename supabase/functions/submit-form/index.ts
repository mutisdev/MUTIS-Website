import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verifyRecaptcha } from "../_shared/recaptcha.ts";
import { isUniEmail, normaliseEmail, UNI_EMAIL_ERROR } from "../_shared/uniEmail.ts";
import { hasEventEnded } from "../_shared/eventStatus.ts";

// Single entry point for every public form on the site. The anon role no
// longer has INSERT on the submission tables (or upload on
// alumni_submission_photos), so the only way to write a submission is through
// here — which verifies the reCAPTCHA token first.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

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

type Payload = Record<string, unknown>;

// ---- field readers: throw InvalidInput so each handler reads top-to-bottom ----

function str(p: Payload, key: string, max: number, required = true): string | null {
  const raw = p[key];
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    if (required) throw new InvalidInput(`Missing field: ${key}`);
    return null;
  }
  if (value.length > max) throw new InvalidInput(`Field too long: ${key}`);
  return value;
}

function email(p: Payload, key: string): string {
  const value = str(p, key, 320)!;
  if (!EMAIL_RE.test(value)) throw new InvalidInput("Enter a valid email address.");
  return value;
}

/** A University of Manchester address, returned trimmed and lowercased — the
 * form the database constraints require and members are matched on. */
function uniEmail(p: Payload, key: string): string {
  const value = email(p, key);
  if (!isUniEmail(value)) throw new InvalidInput(UNI_EMAIL_ERROR);
  return normaliseEmail(value);
}

function mustBeTrue(p: Payload, key: string) {
  if (p[key] !== true) throw new InvalidInput(`Consent required: ${key}`);
}

// ---- per-form handlers ----

type Handler = (db: SupabaseClient, p: Payload, photo: File | null) => Promise<{ error: { code?: string; message: string } | null }>;

const handlers: Record<string, Handler> = {
  contact: async (db, p) => {
    mustBeTrue(p, "consent_privacy");
    return await db.from("contact_submissions").insert({
      name: str(p, "name", 200),
      email: email(p, "email"),
      reason: "General enquiry",
      message: str(p, "message", 5000),
    });
  },

  sponsorship: async (db, p) => {
    mustBeTrue(p, "consent_privacy");
    return await db.from("sponsorship_enquiries").insert({
      company: str(p, "company", 200),
      name: str(p, "name", 200),
      email: email(p, "email"),
      message: str(p, "message", 5000),
    });
  },

  event_signup: async (db, p) => {
    mustBeTrue(p, "consent_privacy");
    const eventId = str(p, "event_id", 64)!;
    const { data: event } = await db
      .from("events")
      .select("id, starts_at, ends_at")
      .eq("id", eventId)
      .eq("is_published", true)
      .eq("signup_enabled", true)
      .maybeSingle();
    if (!event) throw new InvalidInput("Signups aren't open for this event.");
    if (hasEventEnded(event)) throw new InvalidInput("This event has already happened, so signups are closed.");
    return await db.from("event_signups").insert({
      event_id: eventId,
      name: str(p, "name", 200),
      email: uniEmail(p, "email"),
    });
  },

  // Anonymous event feedback. The feedback row never holds a name or email.
  // If the visitor says they're a member, their attendance goes into
  // member_event_attendance, a separate table with no link to the feedback
  // (no shared id; both only keep the date).
  attendance: async (db, p) => {
    const eventId = str(p, "event_id", 64, false);
    const otherEventName = str(p, "other_event_name", 200, false);
    if (!eventId === !otherEventName) throw new InvalidInput("Choose an event or name the event you attended.");
    const rating = p.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new InvalidInput("Rating must be between 1 and 5.");
    }
    // Absent (e.g. an old cached copy of the form) counts as "No".
    const isMember = p.is_member === true;

    if (isMember && eventId) {
      const { data: event } = await db.from("events").select("id").eq("id", eventId).maybeSingle();
      if (!event) throw new InvalidInput("That event doesn't exist.");
      // Recorded first and idempotent, so resubmitting after a failed
      // feedback insert never double counts attendance.
      const { error: attendanceError } = await db
        .from("member_event_attendance")
        .upsert({ event_id: eventId, email: uniEmail(p, "email") }, { onConflict: "event_id,email", ignoreDuplicates: true });
      if (attendanceError) return { error: attendanceError };
    }

    return await db.from("attendance_submissions").insert({
      event_id: eventId,
      other_event_name: otherEventName,
      rating,
      comments: str(p, "comments", 5000, false),
    });
  },

  membership: async (db, p) => {
    mustBeTrue(p, "consent_privacy");
    const signup = {
      full_name: str(p, "full_name", 200),
      email: uniEmail(p, "email"),
      course: str(p, "course", 200),
      year: str(p, "year", 50),
      consent_share_partners: true,
      consent_share_partners_at: new Date().toISOString(),
    };
    // Read (and validate) before inserting, so a bad payload never leaves a
    // member without their answers counted.
    const diversity = {
      p_ethnicity: str(p, "ethnicity", 200)!,
      p_contextual_offer_eligible: str(p, "contextual_offer_eligible", 100)!,
      p_school_type: str(p, "school_type", 100)!,
      p_first_generation_student: str(p, "first_generation_student", 100)!,
      p_free_school_meals: str(p, "free_school_meals", 100)!,
    };

    const result = await db.from("membership_signups").insert(signup);
    if (result.error) return result;

    // Diversity answers are only added to anonymous totals, never stored
    // against the member. Supplementary: a failure here shouldn't undo an
    // already-successful signup, just gets logged for follow-up.
    const { error: diversityError } = await db.rpc("record_diversity_answers", diversity);
    if (diversityError) console.error("Failed to record diversity totals", diversityError);
    return { error: null };
  },

  alumni: async (db, p, photo) => {
    mustBeTrue(p, "consent_publish");
    mustBeTrue(p, "consent_gdpr");
    const graduationYear = p.graduation_year;
    const maxYear = new Date().getFullYear() + 1;
    if (typeof graduationYear !== "number" || !Number.isInteger(graduationYear) || graduationYear < 1960 || graduationYear > maxYear) {
      throw new InvalidInput(`Enter a graduation year between 1960 and ${maxYear}.`);
    }
    const linkedinUrl = str(p, "linkedin_url", 500, false);
    if (linkedinUrl && !/^https?:\/\//i.test(linkedinUrl)) throw new InvalidInput("Enter a full LinkedIn URL.");

    const row = {
      full_name: str(p, "full_name", 200),
      graduation_year: graduationYear,
      degree_course: str(p, "degree_course", 200, false),
      current_company: str(p, "current_company", 200),
      current_position: str(p, "current_position", 200),
      industry: str(p, "industry", 200, false),
      linkedin_url: linkedinUrl,
      mutis_position: str(p, "mutis_position", 200, false),
      consent_publish: true,
      consent_gdpr: true,
      consent_at: new Date().toISOString(),
    };

    let photoPath: string | null = null;
    let photoUrl: string | null = null;
    if (photo) {
      if (photo.type !== "image/jpeg") throw new InvalidInput("Photo must be a JPEG image.");
      if (photo.size > MAX_PHOTO_BYTES) throw new InvalidInput("Photo is too large.");
      photoPath = `${crypto.randomUUID()}.jpeg`;
      const { error: uploadError } = await db.storage
        .from("alumni_submission_photos")
        .upload(photoPath, photo, { contentType: "image/jpeg" });
      if (uploadError) return { error: { code: "storage_upload", message: uploadError.message } };
      photoUrl = db.storage.from("alumni_submission_photos").getPublicUrl(photoPath).data.publicUrl;
    }

    const result = await db.from("alumni_submissions").insert({ ...row, photo_url: photoUrl });
    if (result.error && photoPath) {
      await db.storage.from("alumni_submission_photos").remove([photoPath]);
    }
    return result;
  },
};

// Error responses are { code, error?, detail? }. `code` is one fixed value per
// failure mode and `detail` narrows it (Postgres code, reCAPTCHA error codes),
// so the reference the visitor sees on the form points at one branch here.
// Nothing sensitive goes in `detail`: no raw database messages.

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);

  // JSON for every form except one with a file (the alumni photo), which
  // comes as multipart. Some in-app browsers (Instagram) fail to send
  // multipart bodies, so the website only uses it when it must.
  let formName: string;
  let token: string;
  let payload: Payload;
  let photo: File | null = null;
  try {
    const contentType = req.headers.get("content-type")?.toLowerCase() ?? "";
    if (contentType.startsWith("application/json")) {
      const body = await req.json();
      formName = String(body?.form ?? "");
      token = String(body?.token ?? "");
      payload = body?.payload ?? {};
      if (typeof payload !== "object" || payload === null || Array.isArray(payload)) throw new Error("payload");
    } else {
      const body = await req.formData();
      formName = String(body.get("form") ?? "");
      token = String(body.get("token") ?? "");
      payload = JSON.parse(String(body.get("payload") ?? "{}"));
      const photoField = body.get("photo");
      if (photoField instanceof File) photo = photoField;
    }
  } catch (err) {
    console.warn("Unreadable request body", req.headers.get("content-type"), err);
    return json({ code: "bad_request", error: "Invalid request body" }, 400);
  }

  const handler = handlers[formName];
  if (!handler) return json({ code: "unknown_form", error: "Unknown form", detail: formName.slice(0, 50) }, 400);
  if (photo && formName !== "alumni") return json({ code: "unexpected_file", error: "Unexpected file" }, 400);

  try {
    // Feedback is anonymous, so don't pass the visitor's IP on to Google for it.
    const remoteIp =
      formName === "attendance" ? undefined : req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const captcha = await verifyRecaptcha(token, remoteIp);
    if (!captcha.ok) {
      console.warn("reCAPTCHA rejected", formName, captcha.errorCodes);
      return json({ code: "captcha_failed", detail: captcha.errorCodes.join(",") }, 400);
    }
  } catch (err) {
    console.error("reCAPTCHA verification error", err);
    return json({ code: "captcha_unavailable" }, 502);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { error } = await handler(db, payload, photo);
    if (error) {
      if (error.code === "23505") return json({ code: "duplicate" }, 409);
      console.error(`Failed to insert ${formName} submission`, error);
      return json({ code: "db_error", detail: error.code ?? "none" }, 500);
    }
  } catch (err) {
    if (err instanceof InvalidInput) return json({ code: "invalid", error: err.message }, 400);
    console.error(`Unexpected error handling ${formName}`, err);
    return json({ code: "internal", detail: err instanceof Error ? err.name : typeof err }, 500);
  }

  return json({ ok: true }, 200);
});
