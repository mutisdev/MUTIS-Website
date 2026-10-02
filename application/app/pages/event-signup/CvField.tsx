import { useRef, useState } from "react";
import {
  CV_MAX_BYTES,
  cvContentError,
  cvSizeError,
  formatFileSize,
  PDF_HEADER_BYTES,
  PDF_TRAILER_WINDOW_BYTES,
} from "@shared/eventApplications";

interface CvFieldProps {
  id: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Error raised by the parent form on submit (e.g. "Please attach your CV"). */
  error?: string;
}

/**
 * The CV row on the application form. Unlike the admin PdfUploader this does NOT
 * upload on selection: the bucket is private and the public has no upload
 * permission on it, so the file travels with the submission and
 * submit-application stores it with the service role.
 *
 * Validation here is a courtesy that gives an instant error; the server repeats
 * every check on the bytes it receives and that run is the one that decides.
 * Only the first and last few bytes are read, so checking a 5 MB file is free.
 */
export function CvField({ id, file, onChange, error }: CvFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState("");
  const [checking, setChecking] = useState(false);

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const shownError = localError || error || "";

  const select = async (chosen: File | null) => {
    setLocalError("");
    if (!chosen) {
      onChange(null);
      return;
    }

    const sizeError = cvSizeError(chosen.size);
    if (sizeError) {
      setLocalError(sizeError);
      onChange(null);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setChecking(true);
    try {
      // Read only the header and the tail — never the whole file.
      const head = new Uint8Array(await chosen.slice(0, PDF_HEADER_BYTES).arrayBuffer());
      const tail = new Uint8Array(await chosen.slice(-PDF_TRAILER_WINDOW_BYTES).arrayBuffer());
      const merged = new Uint8Array(head.length + tail.length);
      merged.set(head, 0);
      merged.set(tail, head.length);

      const contentError = cvContentError(merged);
      if (contentError) {
        setLocalError(contentError);
        onChange(null);
        if (inputRef.current) inputRef.current.value = "";
        return;
      }
      onChange(chosen);
    } catch (err) {
      // An unreadable file (permissions, a file that vanished) shouldn't look
      // like a rejected one.
      console.error("Could not read the chosen CV", err);
      setLocalError("We couldn't read that file. Please choose it again.");
      onChange(null);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="field">
      <label htmlFor={id}>CV (PDF) *</label>
      <input
        ref={inputRef}
        id={id}
        name="cv"
        type="file"
        accept="application/pdf,.pdf"
        required
        aria-invalid={shownError ? "true" : undefined}
        aria-describedby={shownError ? errorId : hintId}
        onChange={(e) => void select(e.target.files?.[0] ?? null)}
      />

      {file && !shownError && (
        <p className="cv-chosen" aria-live="polite">
          <span className="cv-chosen-name">{file.name}</span>
          <span className="cv-chosen-size">{formatFileSize(file.size)}</span>
        </p>
      )}

      {shownError ? (
        <span id={errorId} className="field-error" role="alert">
          {shownError}
        </span>
      ) : (
        <span id={hintId} className="field-hint">
          {checking ? "Checking your file…" : `PDF only, up to ${formatFileSize(CV_MAX_BYTES)}.`}
        </span>
      )}
    </div>
  );
}
