import { Link } from "react-router";
import { formatFileSize } from "@shared/eventApplications";
import type { ApplicationReceiptData } from "@/app/lib/submitApplication";

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

interface ApplicationReceiptProps {
  receipt: ApplicationReceiptData;
  /** False when the receipt email couldn't be sent — said plainly, so nobody
   * waits for an email that isn't coming. */
  emailed: boolean;
}

/**
 * What the applicant sees after submitting. Deliberately NOT the sign-up
 * confirmation: nobody has read their answers yet, so this is a record of what
 * was received and nothing more.
 *
 * Everything shown comes from the Edge Function's response, which built it from
 * the answers it actually stored — so this screen, the receipt email and the
 * database row are the same list in the same order.
 *
 * `.application-receipt` is the hook the print stylesheet uses to strip the page
 * down to this card.
 */
export function ApplicationReceipt({ receipt, emailed }: ApplicationReceiptProps) {
  return (
    <div className="application-receipt r-up">
      <div className="application-receipt-head">
        <h2>Application received</h2>
        <p className="application-receipt-code">
          <span>Your reference</span>
          <strong>{receipt.reference_code}</strong>
        </p>
      </div>

      {/* The honest bit, said plainly and before anything else. */}
      <p className="application-receipt-notice" role="status">
        Your answers will be reviewed. This is not a confirmed place.
      </p>

      <dl className="application-receipt-details">
        <div>
          <dt>Event</dt>
          <dd>{receipt.event.title}</dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{dateTimeFormat.format(new Date(receipt.event.starts_at))}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{receipt.event.location}</dd>
        </div>
        <div>
          <dt>Name</dt>
          <dd>{receipt.name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{receipt.email}</dd>
        </div>
        <div>
          <dt>Submitted</dt>
          <dd>{dateTimeFormat.format(new Date(receipt.submitted_at))}</dd>
        </div>
        <div>
          <dt>CV</dt>
          <dd>
            {receipt.cv_file_name} <span className="application-receipt-dim">({formatFileSize(receipt.cv_size_bytes)})</span>
          </dd>
        </div>
      </dl>

      <h3 className="application-receipt-subhead">Your answers</h3>
      <dl className="application-receipt-answers">
        {receipt.answers.map((answer, index) => (
          <div key={index}>
            <dt>{answer.prompt}</dt>
            <dd>{answer.answer_text}</dd>
          </div>
        ))}
      </dl>

      <p className="application-receipt-email" role="status">
        {emailed
          ? `We've emailed a copy of this receipt to ${receipt.email}.`
          : "We couldn't email you a copy of this receipt, so please print or save it now — your application itself was received safely."}
      </p>

      {/* Hidden when printing: the page is the receipt at that point. */}
      <div className="application-receipt-actions">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Print or save as PDF
          <span className="arrow" />
        </button>
        <Link to="/events" className="btn btn-ghost" style={{ textDecoration: "none" }}>
          Back to events
          <span className="arrow" />
        </Link>
      </div>
    </div>
  );
}
