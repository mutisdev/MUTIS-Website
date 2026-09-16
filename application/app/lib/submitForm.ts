import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type PublicFormName = "contact" | "sponsorship" | "event_signup" | "attendance" | "membership" | "alumni";

export type SubmitFormResult =
  | { ok: true }
  | { ok: false; code: "captcha_failed" | "duplicate" | "invalid" | "unknown"; message?: string };

/**
 * Sends a public form submission to the `submit-form` Edge Function, which
 * verifies the reCAPTCHA token before inserting. Direct inserts from the
 * browser are no longer permitted by RLS.
 */
export async function submitForm(
  form: PublicFormName,
  token: string,
  payload: Record<string, unknown>,
  photo?: Blob | null
): Promise<SubmitFormResult> {
  const body = new FormData();
  body.append("form", form);
  body.append("token", token);
  body.append("payload", JSON.stringify(payload));
  if (photo) body.append("photo", photo, "photo.jpeg");

  const { error } = await supabase.functions.invoke("submit-form", { body });
  if (!error) return { ok: true };

  if (error instanceof FunctionsHttpError) {
    try {
      const data: { code?: string; error?: string } = await error.context.json();
      if (data.code === "captcha_failed" || data.code === "duplicate" || data.code === "invalid") {
        return { ok: false, code: data.code, message: data.error };
      }
    } catch {
      // fall through to unknown
    }
  }
  console.error(`Failed to submit ${form} form`, error);
  return { ok: false, code: "unknown" };
}
