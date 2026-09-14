import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * Shared email input with live (on-blur) validation, reused across every
 * public form. Uncontrolled — like the rest of these forms, the submitted
 * value is still read from the DOM via form.elements on submit; this
 * component only owns the inline error message shown before that.
 */
export function EmailField({
  id,
  name = "email",
  label,
  placeholder,
  autoComplete = "email",
  required = true,
}: EmailFieldProps) {
  const [error, setError] = useState("");
  const errorId = `${id}-error`;

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
        aria-describedby={error ? errorId : undefined}
        onBlur={(e) => setError(validateEmail(e.target.value, required))}
        onChange={(e) => {
          if (error) setError(validateEmail(e.target.value, required));
        }}
      />
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
