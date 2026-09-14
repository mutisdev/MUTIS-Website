import type { ReactNode } from "react";
import { Link } from "react-router";

interface PrivacyConsentProps {
  id: string;
  name?: string;
  error?: string;
  /** Extra clause appended to the same checkbox's label, for a page whose
   * consent covers more than just the Privacy Policy (e.g. the Signup form's
   * consent to share data with partner firms) — still one checkbox, one
   * consent action, just with combined wording. */
  additionalText?: ReactNode;
}

/**
 * Shared "I agree to the Privacy Policy" checkbox, reused across every public
 * form on the site. Read `form.elements.namedItem(name).checked` in the
 * submit handler — this component only renders the field, it doesn't gate
 * submission itself.
 */
export function PrivacyConsent({ id, name = "consent-privacy", error, additionalText }: PrivacyConsentProps) {
  const errorId = `${id}-error`;
  return (
    <>
      <div className="field-checkbox">
        <input
          id={id}
          name={name}
          type="checkbox"
          required
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        />
        <label htmlFor={id}>
          I have read and agree to MUTIS's{" "}
          <Link to="/privacy" target="_blank" rel="noreferrer">
            Privacy Policy
          </Link>{" "}
          on how my data will be stored and used
          {additionalText ? <>, and {additionalText}</> : null}. *
        </label>
      </div>
      {error && (
        <span id={errorId} className="field-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
