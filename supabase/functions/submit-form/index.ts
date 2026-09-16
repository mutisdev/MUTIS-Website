import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { verifyRecaptcha } from "../_shared/recaptcha.ts";

// Single entry point for every public form on the site. The anon role no
// longer has INSERT on the submission tables (or upload on
// alumni_submission_photos), so the only way to write a submission is through
// here — which verifies the reCAPTCHA token first.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MANCHESTER_DOMAIN = "manchester.ac.uk";
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

function email(p: Payload, key: string, requireManchester = false): string {
  const value = str(p, key, 320)!;
  if (!EMAIL_RE.test(value)) throw new InvalidInput("Enter a valid email address.");
  if (requireManchester) {
    const domain = value.split("@")[1]?.toLowerCase() ?? "";
    if (domain !== MANCHESTER_DOMAIN && !domain.endsWith(`.${MANCHESTER_DOMAIN}`)) {
      throw new InvalidInput("Enter a University of Manchester email address.");
    }
  }
  return value;
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
      .select("id")
      .eq("id", eventId)
      .eq("is_published", true)
      .eq("signup_enabled", true)
      .maybeSingle();
    if (!event) throw new InvalidInput("Signups aren't open for this event.");
    return await db.from("event_signups").insert({
      event_id: eventId,
      name: str(p, "name", 200),
      email: email(p, "email"),
    });
  },

  attendance: async (db, p) => {
    mustBeTrue(p, "consent_privacy");
    const eventId = str(p, "event_id", 64, false);
    const otherEventName = str(p, "other_event_name", 200, false);
    if (!eventId === !otherEventName) throw new InvalidInput("Choose an event or name the event you attended.");
    const rating = p.rating;
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new InvalidInput("Rating must be between 1 and 5.");
    }
    return await db.from("attendance_submissions").insert({
      event_id: eventId,
      other_event_name: otherEventName,
      name: str(p, "name", 200),
      email: email(p, "email", true),
      course: str(p, "course", 200),
      year: str(p, "year", 50),
      rating,
      comments: str(p, "comments", 5000, false),
    });
  },

  membership: async (db, p) => {
    mustBeTrue(p, "consent_privacy");
    const signupId = crypto.randomUUID();
    const signup = {
      id: signupId,
      full_name: str(p, "full_name", 200),
      email: email(p, "email", true),
      course: str(p, "course", 200),
      year: str(p, "year", 50),
      consent_share_partners: true,
      consent_share_partners_at: new Date().toISOString(),
    };
    const diversity = {
      signup_id: signupId,
      ethnicity: str(p, "ethnicity", 200),
      ethnicity_other_description: str(p, "ethnicity_other_description", 500, false),
      contextual_offer_eligible: str(p, "contextual_offer_eligible", 100),
      school_type: str(p, "school_type", 100),
      first_generation_student: str(p, "first_generation_student", 100),
      free_school_meals: str(p, "free_school_meals", 100),
    };

    const result = await db.from("membership_signups").insert(signup);
    if (result.error) return result;

    // Diversity data is supplementary — a failure here shouldn't undo an
    // already-successful signup, just gets logged for follow-up.
    const { error: diversityError } = await db.from("membership_signup_diversity").insert(diversity);
    if (diversityError) console.error("Failed to insert diversity data", diversityError);
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
      if (uploadError) return { error: { message: uploadError.message } };
      photoUrl = db.storage.from("alumni_submission_photos").getPublicUrl(photoPath).data.publicUrl;
    }

    const result = await db.from("alumni_submissions").insert({ ...row, photo_url: photoUrl });
    if (result.error && photoPath) {
      await db.storage.from("alumni_submission_photos").remove([photoPath]);
    }
    return result;
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ code: "method_not_allowed" }, 405);

  let formName: string;
  let token: string;
  let payload: Payload;
  let photo: File | null = null;
  try {
    const body = await req.formData();
    formName = String(body.get("form") ?? "");
    token = String(body.get("token") ?? "");
    payload = JSON.parse(String(body.get("payload") ?? "{}"));
    const photoField = body.get("photo");
    if (photoField instanceof File) photo = photoField;
  } catch {
    return json({ code: "invalid", error: "Invalid request body" }, 400);
  }

  const handler = handlers[formName];
  if (!handler) return json({ code: "invalid", error: "Unknown form" }, 400);
  if (photo && formName !== "alumni") return json({ code: "invalid", error: "Unexpected file" }, 400);

  try {
    const remoteIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const captcha = await verifyRecaptcha(token, remoteIp);
    if (!captcha.ok) {
      console.warn("reCAPTCHA rejected", formName, captcha.errorCodes);
      return json({ code: "captcha_failed" }, 400);
    }
  } catch (err) {
    console.error("reCAPTCHA verification error", err);
    return json({ code: "unknown" }, 500);
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { error } = await handler(db, payload, photo);
    if (error) {
      if (error.code === "23505") return json({ code: "duplicate" }, 409);
      console.error(`Failed to insert ${formName} submission`, error);
      return json({ code: "unknown" }, 500);
    }
  } catch (err) {
    if (err instanceof InvalidInput) return json({ code: "invalid", error: err.message }, 400);
    console.error(`Unexpected error handling ${formName}`, err);
    return json({ code: "unknown" }, 500);
  }

  return json({ ok: true }, 200);
});
