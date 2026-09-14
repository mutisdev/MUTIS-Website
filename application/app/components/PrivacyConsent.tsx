import { Link } from "react-router";

interface PrivacyConsentProps {
  id: string;
  name?: string;
  error?: string;
}

/**
 * Shared "I agree to the Privacy Policy" checkbox, reused across every public
 * form on the site. Read `form.elements.namedItem(name).checked` in the
 * submit handler — this component only renders the field, it doesn't gate
 * submission itself.
 */
export function PrivacyConsent({ id, name = "consent-privacy", error }: PrivacyConsentProps) {
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
          on how my data will be stored and used. *
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
