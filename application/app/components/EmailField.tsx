import { useState } from "react";
import { isUniEmail, UNI_EMAIL_DOMAINS, UNI_EMAIL_ERROR } from "@shared/uniEmail";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const UNI_EMAIL_HINT = `Must end in ${UNI_EMAIL_DOMAINS.map((d) => `@${d}`).join(", ")}.`;

interface EmailFieldProps {
  id: string;
  name?: string;
  label: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
}

/** Exported so a form's onSubmit can re-check the email before inserting,
 * in case the visitor never blurred the field (e.g. paste + immediate submit). */
export function validateEmail(value: string, required: boolean): string {
  const trimmed = value.trim();
  if (!trimmed) return required ? "Email is required." : "";
  if (!EMAIL_RE.test(trimmed)) return "Enter a valid email address.";
  return "";
}

/** Same as validateEmail, but only accepts University of Manchester addresses
 * (see supabase/functions/_shared/uniEmail.ts, which the server also uses). */
export function validateUniEmail(value: string, required = true): string {
  const basic = validateEmail(value, required);
  if (basic || !value.trim()) return basic;
  return isUniEmail(value) ? "" : UNI_EMAIL_ERROR;
}

/**
 * Shared email input with live (on-blur) validation, reused across every
 * public form. Uncontrolled — like the rest of these forms, the submitted
 * value is still read from the DOM via form.elements on submit; this
 * component only owns the inline error message shown before that.
 */
export function EmailField(props: EmailFieldProps) {
  return <EmailInput {...props} validate={(v) => validateEmail(v, props.required ?? true)} />;
}

/** EmailField for forms that only accept University of Manchester addresses. */
export function UniEmailField({
  label = "University email *",
  placeholder = "you@student.manchester.ac.uk",
  ...props
}: Omit<EmailFieldProps, "label"> & { label?: string }) {
  return (
    <EmailInput
      {...props}
      label={label}
      placeholder={placeholder}
      hint={UNI_EMAIL_HINT}
      validate={(v) => validateUniEmail(v, props.required ?? true)}
    />
  );
}

function EmailInput({
  id,
  name = "email",
  label,
  placeholder,
  autoComplete = "email",
  required = true,
  hint,
  validate,
}: EmailFieldProps & { hint?: string; validate: (value: string) => string }) {
  const [error, setError] = useState("");
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="email"
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? "true" : undefined}
        aria-describedby={describedBy}
        onBlur={(e) => setError(validate(e.target.value))}
        onChange={(e) => {
          if (error) setError(validate(e.target.value));
        }}
      />
      {error ? (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      ) : (
        hint && (
          <span id={hintId} className="field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
