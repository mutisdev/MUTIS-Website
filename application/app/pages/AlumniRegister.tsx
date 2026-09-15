import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Loader2, Upload, X } from "lucide-react";
import { useReveal } from "@/app/hooks/useReveal";
import { useSiteSettings } from "@/app/hooks/useSiteSettings";
import { useFormStatus } from "@/app/hooks/useFormStatus";
import { FormFeedback } from "@/app/components/FormFeedback";
import { PrivacyConsent } from "@/app/components/PrivacyConsent";
import { supabase } from "@/lib/supabase";

const SUCCESS_TOAST_MS = 10000;

const CURRENT_YEAR = new Date().getFullYear();
const MIN_GRAD_YEAR = 1960;
const MAX_GRAD_YEAR = CURRENT_YEAR + 1;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

type FieldKey =
  | "fullName"
  | "graduationYear"
  | "currentCompany"
  | "currentPosition"
  | "linkedinUrl"
  | "consentPublish"
  | "consentGdpr";

type FieldErrors = Partial<Record<FieldKey, string>>;

async function cropToSquareJpeg(file: File, maxWidth = 800): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image file."));
      img.src = url;
    });
    const side = Math.min(img.width, img.height);
    const sx = (img.width - side) / 2;
    const sy = (img.height - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(side, maxWidth);
    canvas.height = canvas.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser doesn't support image cropping.");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) throw new Error("Could not process that image.");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <span id={id} className="field-error" role="alert">
      {message}
    </span>
  );
}

export function AlumniRegister() {
  useReveal();
  const { settings } = useSiteSettings();
  const { status, error, submitting, fail, succeed, onFormInput } = useFormStatus();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  // Floating instead of an inline banner: a long form means "sent" can
  // happen while the visitor is scrolled well past the top of the page,
  // where an inline success banner would go unseen. `toastVisible` mounts
  // the toast; `toastIn` is flipped a frame later so the opacity/transform
  // change is a genuine CSS transition (mount → paint → transition), the
  // same two-step trick the site's own .r-up/.r-up.in reveal uses. Hiding
  // reverses that (`toastIn` false triggers the fade-out transition) and
  // only unmounts once that transition has actually finished.
  const [toastVisible, setToastVisible] = useState(false);
  const [toastIn, setToastIn] = useState(false);
  const toastHideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const toastUnmountTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const hideToast = () => {
    clearTimeout(toastHideTimer.current);
    setToastIn(false);
    toastUnmountTimer.current = setTimeout(() => setToastVisible(false), 250);
  };

  useEffect(() => {
    if (status !== "sent") {
      if (toastVisible) hideToast();
      return;
    }
    clearTimeout(toastUnmountTimer.current);
    setToastVisible(true);
    const raf = requestAnimationFrame(() => setToastIn(true));
    toastHideTimer.current = setTimeout(hideToast, SUCCESS_TOAST_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(toastHideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  useEffect(
    () => () => {
      clearTimeout(toastHideTimer.current);
      clearTimeout(toastUnmountTimer.current);
    },
    []
  );

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoPreview, setPhotoPreview] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError("That image is too large — please choose one under 8MB.");
      return;
    }

    setPhotoError("");
    setPhotoUploading(true);
    try {
      const blob = await cropToSquareJpeg(file);
      const path = `${crypto.randomUUID()}.jpeg`;
      const { error: uploadError } = await supabase.storage
        .from("alumni_submission_photos")
        .upload(path, blob, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("alumni_submission_photos").getPublicUrl(path);
      setPhotoUrl(data.publicUrl);
      setPhotoPreview(data.publicUrl);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const removePhoto = () => {
    setPhotoUrl("");
    setPhotoPreview("");
    setPhotoError("");
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;

    if ((form.elements.namedItem("bot-field") as HTMLInputElement)?.value) {
      succeed();
      return;
    }

    const fullName = (form.elements.namedItem("full-name") as HTMLInputElement).value.trim();
    const graduationYearRaw = (form.elements.namedItem("graduation-year") as HTMLInputElement).value.trim();
    const degreeCourse = (form.elements.namedItem("degree-course") as HTMLInputElement).value.trim();
    const currentCompany = (form.elements.namedItem("current-company") as HTMLInputElement).value.trim();
    const currentPosition = (form.elements.namedItem("current-position") as HTMLInputElement).value.trim();
    const industry = (form.elements.namedItem("industry") as HTMLInputElement).value.trim();
    const linkedinUrl = (form.elements.namedItem("linkedin-url") as HTMLInputElement).value.trim();
    const mutisPosition = (form.elements.namedItem("mutis-position") as HTMLInputElement).value.trim();
    const consentPublish = (form.elements.namedItem("consent-publish") as HTMLInputElement).checked;
    const consentGdpr = (form.elements.namedItem("consent-gdpr") as HTMLInputElement).checked;

    const graduationYear = Number(graduationYearRaw);

    const errors: FieldErrors = {};
    if (!fullName) errors.fullName = "Please enter your full name.";
    if (
      !graduationYearRaw ||
      !Number.isInteger(graduationYear) ||
      graduationYear < MIN_GRAD_YEAR ||
      graduationYear > MAX_GRAD_YEAR
    ) {
      errors.graduationYear = `Enter a graduation year between ${MIN_GRAD_YEAR} and ${MAX_GRAD_YEAR}.`;
    }
    if (!currentCompany) errors.currentCompany = "Please enter your current company.";
    if (!currentPosition) errors.currentPosition = "Please enter your current position or role.";
    if (linkedinUrl && !/^https?:\/\//i.test(linkedinUrl)) {
      errors.linkedinUrl = "Enter a full URL starting with https://";
    }
    if (!consentPublish) errors.consentPublish = "Required to feature your details in the directory.";
    if (!consentGdpr) errors.consentGdpr = "Required to submit this form.";

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      fail("Please fix the highlighted fields below.");
      return;
    }

    submitting();

    const { error: insertError } = await supabase.from("alumni_submissions").insert({
      full_name: fullName,
      graduation_year: graduationYear,
      degree_course: degreeCourse || null,
      current_company: currentCompany,
      current_position: currentPosition,
      industry: industry || null,
      linkedin_url: linkedinUrl || null,
      photo_url: photoUrl || null,
      mutis_position: mutisPosition || null,
      consent_publish: consentPublish,
      consent_gdpr: consentGdpr,
      consent_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error("Failed to submit alumni registration", insertError);
      fail(`Something went wrong. Please try again or email us at ${settings.contact_email}.`);
      return;
    }

    succeed();
    form.reset();
    setFieldErrors({});
    removePhoto();
  };

  return (
    <>
      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><Link to="/network">Our Network</Link><span>/</span><span>Register</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Our Network</div>
            <h1 className="page-title r-up">Alumni<br /><span className="accent">Directory</span></h1>
          </div>
          <p className="page-sub r-up">
            Tell us where MUTIS took you. It takes a couple of minutes, and helps current
            members see the range of paths open to them.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div style={{ maxWidth: 640, marginInline: "auto" }}>
            <div>
              <div className="page-eyebrow r-up"><span className="bar" />Registration form</div>
              <h2 className="r-up">Your details</h2>
              <p className="lede r-up">Fields marked * are required. Everything else is optional.</p>

              <form
                className="contact-form r-up"
                name="alumni-register"
                onSubmit={onSubmit}
                onInput={onFormInput}
                noValidate
                style={{ marginTop: 24 }}
              >
                  <p className="hidden-field">
                    <label>
                      Don't fill this out if you're human:{" "}
                      <input name="bot-field" tabIndex={-1} autoComplete="off" />
                    </label>
                  </p>

                  <div className="field">
                    <label htmlFor="al-full-name">Full name *</label>
                    <input
                      id="al-full-name"
                      name="full-name"
                      type="text"
                      autoComplete="name"
                      required
                      aria-invalid={fieldErrors.fullName ? "true" : undefined}
                      aria-describedby={fieldErrors.fullName ? "al-full-name-error" : undefined}
                    />
                    <FieldError id="al-full-name-error" message={fieldErrors.fullName} />
                  </div>

                  <div className="field">
                    <label htmlFor="al-graduation-year">Graduation year *</label>
                    <input
                      id="al-graduation-year"
                      name="graduation-year"
                      type="number"
                      inputMode="numeric"
                      min={MIN_GRAD_YEAR}
                      max={MAX_GRAD_YEAR}
                      step={1}
                      placeholder={`e.g. ${CURRENT_YEAR}`}
                      required
                      aria-invalid={fieldErrors.graduationYear ? "true" : undefined}
                      aria-describedby={fieldErrors.graduationYear ? "al-graduation-year-error" : undefined}
                    />
                    <FieldError id="al-graduation-year-error" message={fieldErrors.graduationYear} />
                  </div>

                  <div className="field">
                    <label htmlFor="al-degree-course">Degree / course</label>
                    <input id="al-degree-course" name="degree-course" type="text" placeholder="e.g. BSc Finance" />
                  </div>

                  <div className="field">
                    <label htmlFor="al-current-company">Current company *</label>
                    <input
                      id="al-current-company"
                      name="current-company"
                      type="text"
                      required
                      aria-invalid={fieldErrors.currentCompany ? "true" : undefined}
                      aria-describedby={fieldErrors.currentCompany ? "al-current-company-error" : undefined}
                    />
                    <FieldError id="al-current-company-error" message={fieldErrors.currentCompany} />
                  </div>

                  <div className="field">
                    <label htmlFor="al-current-position">Current position / role *</label>
                    <input
                      id="al-current-position"
                      name="current-position"
                      type="text"
                      required
                      aria-invalid={fieldErrors.currentPosition ? "true" : undefined}
                      aria-describedby={fieldErrors.currentPosition ? "al-current-position-error" : undefined}
                    />
                    <FieldError id="al-current-position-error" message={fieldErrors.currentPosition} />
                  </div>

                  <div className="field">
                    <label htmlFor="al-industry">Industry / division</label>
                    <input
                      id="al-industry"
                      name="industry"
                      type="text"
                      placeholder="e.g. Investment Banking, Markets, Asset Management, Consulting, Tech"
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="al-linkedin-url">LinkedIn profile URL</label>
                    <input
                      id="al-linkedin-url"
                      name="linkedin-url"
                      type="url"
                      placeholder="https://linkedin.com/in/…"
                      aria-invalid={fieldErrors.linkedinUrl ? "true" : undefined}
                      aria-describedby={fieldErrors.linkedinUrl ? "al-linkedin-url-error" : undefined}
                    />
                    <FieldError id="al-linkedin-url-error" message={fieldErrors.linkedinUrl} />
                  </div>

                  <div className="field">
                    <label htmlFor="al-photo">Profile photo / headshot</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: "50%",
                          overflow: "hidden",
                          flexShrink: 0,
                          border: "1px solid var(--hair)",
                          background: "rgba(255,255,255,0.03)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {photoPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={photoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <Upload style={{ width: 18, height: 18, opacity: 0.4 }} />
                        )}
                      </div>
                      <input
                        ref={photoInputRef}
                        id="al-photo"
                        type="file"
                        accept="image/*"
                        onChange={onPhotoChange}
                        className="hidden-field"
                        aria-describedby={photoError ? "al-photo-error" : undefined}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ textDecoration: "none", fontSize: 12, padding: "10px 16px" }}
                        disabled={photoUploading}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        {photoUploading ? "Uploading…" : photoPreview ? "Replace photo" : "Choose photo"}
                      </button>
                      {photoPreview && !photoUploading && (
                        <button
                          type="button"
                          onClick={removePhoto}
                          title="Remove photo"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dim)", display: "flex" }}
                        >
                          <X style={{ width: 16, height: 16 }} />
                        </button>
                      )}
                      {photoUploading && <Loader2 style={{ width: 16, height: 16 }} className="animate-spin" />}
                    </div>
                    <FieldError id="al-photo-error" message={photoError || undefined} />
                  </div>

                  <div className="field">
                    <label htmlFor="al-mutis-position">MUTIS position / involvement</label>
                    <input
                      id="al-mutis-position"
                      name="mutis-position"
                      type="text"
                      placeholder="e.g. Former President, Member, Events Team"
                    />
                  </div>

                  <div className="field-checkbox">
                    <input
                      id="al-consent-publish"
                      name="consent-publish"
                      type="checkbox"
                      required
                      aria-invalid={fieldErrors.consentPublish ? "true" : undefined}
                      aria-describedby={fieldErrors.consentPublish ? "al-consent-publish-error" : undefined}
                    />
                    <label htmlFor="al-consent-publish">
                      I consent to MUTIS publishing my name, photo, degree, MUTIS involvement, company, position,
                      LinkedIn profile and any responses I have provided on the MUTIS website and/or MUTIS social
                      media. *
                    </label>
                  </div>
                  <FieldError id="al-consent-publish-error" message={fieldErrors.consentPublish} />

                  <PrivacyConsent id="al-consent-gdpr" name="consent-gdpr" error={fieldErrors.consentGdpr} />

                  <FormFeedback status={status} error={error} />

                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={status === "submitting" || photoUploading}
                    aria-busy={status === "submitting"}
                    style={{ alignSelf: "flex-start", marginTop: 8 }}
                  >
                    {status === "submitting" ? "Submitting…" : "Submit"}
                    <span className="arrow" />
                  </button>
                </form>
            </div>
          </div>
        </div>
      </section>

      {toastVisible && (
        <div className="form-toast-wrap">
          <div className={toastIn ? "form-toast form-toast-success in" : "form-toast form-toast-success"}>
            <p role="status" aria-live="polite" aria-atomic="true">
              Thanks — your details have been submitted. The committee will review them before adding you to the
              directory. Feel free to submit another response above.
            </p>
            <button type="button" className="form-toast-dismiss" onClick={hideToast} aria-label="Dismiss">
              <X style={{ width: 14, height: 14 }} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
