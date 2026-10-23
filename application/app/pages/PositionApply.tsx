import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import DOMPurify from "dompurify";
import { useReveal } from "@/app/hooks/useReveal";
import { htmlToExcerpt } from "@/app/lib/htmlExcerpt";
import { PageMeta } from "@/app/components/PageMeta";
import { DEFAULT_DESCRIPTION } from "@/app/hooks/usePageMeta";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import { hasPositionClosed, isPositionOpen, positionStatusLabel } from "@shared/positionStatus";
import type { ApplicationReceiptData } from "@/app/lib/submitApplication";
import { ApplicationForm } from "./event-signup/ApplicationForm";
import { ApplicationReceipt } from "./event-signup/ApplicationReceipt";
import { useEventQuestions } from "./event-signup/useEventQuestions";

type PositionRow = Tables<"positions">;

/**
 * One position or scheme: its full description, and the application form.
 *
 * Mirrors EventSignup, which also serves a listing's details and its form at
 * one URL — but a position has no poster, no date and no venue, so the
 * two-column split is dropped and the status line carries the closing date
 * instead.
 */
export function PositionApply() {
  const { positionId } = useParams();
  const [position, setPosition] = useState<PositionRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [receipt, setReceipt] = useState<{ data: ApplicationReceiptData; emailed: boolean } | null>(null);

  const open = position ? isPositionOpen(position) : false;
  // Only fetched while applications are actually open; RLS additionally limits
  // the rows to published, open listings, so a closed round returns none.
  const {
    questions,
    loading: questionsLoading,
    error: questionsError,
    fingerprint,
  } = useEventQuestions(position ? { kind: "position", id: position.id } : undefined, open);

  useEffect(() => {
    let cancelled = false;

    const loadPosition = async () => {
      if (!positionId) {
        setPosition(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");

      const { data, error: fetchError } = await supabase
        .from("positions")
        .select("*")
        .eq("id", positionId)
        .eq("is_published", true)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (fetchError) {
        console.error("Failed to load position", fetchError);
        setLoadError("We could not load this opportunity right now. Please refresh the page.");
        setPosition(null);
        setIsLoading(false);
        return;
      }

      setPosition(data);
      setIsLoading(false);
    };

    void loadPosition();

    return () => {
      cancelled = true;
    };
  }, [positionId]);

  useReveal([position?.id, isLoading, loadError, questions.length, receipt !== null]);

  if (isLoading) {
    return (
      <section className="page-section">
        <div className="inner">
          <p className="lede r-up" role="status">Loading opportunity…</p>
        </div>
      </section>
    );
  }

  if (loadError || !position) {
    return (
      <section className="page-section">
        <PageMeta
          pathname={`/opportunities/${positionId ?? ""}`}
          override={{
            title: "Opportunity not found | MUTIS Finance Society",
            description: DEFAULT_DESCRIPTION,
            noindex: true,
            noCanonical: true,
          }}
        />
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Opportunities</div>
          <h2 className="r-up">{loadError ? "Something went wrong" : "Opportunity not found"}</h2>
          <p className="lede r-up">
            {loadError || "This opportunity doesn't exist, isn't published, or has been removed."}
          </p>
          <div className="r-up" style={{ marginTop: 24 }}>
            <Link to="/opportunities" className="btn btn-primary" style={{ textDecoration: "none" }}>
              Back to opportunities <span className="arrow" />
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Applications open with no questions is an admin mid-edit, not a usable
  // form — the Edge Function and the RPC both refuse it, so don't render an
  // empty application here either.
  const applicationNotReady = open && !questionsLoading && questions.length === 0;

  const renderFormSlot = () => {
    // Checked before the closed gates: once someone has submitted, their
    // receipt is theirs to read and print, even if an admin closes the round
    // while the page is still open.
    if (receipt) return <ApplicationReceipt receipt={receipt.data} emailed={receipt.emailed} />;

    if (hasPositionClosed(position)) {
      return (
        <p className="event-signup-closed r-up">
          Applications for this opportunity have closed. Head to the{" "}
          <Link to="/opportunities">opportunities page</Link> to see what's open now.
        </p>
      );
    }
    if (!open || applicationNotReady) {
      return (
        <p className="event-signup-closed r-up">
          Applications aren't open for this opportunity right now. Check back later, or head to the{" "}
          <Link to="/opportunities">opportunities page</Link> to see what else is open.
        </p>
      );
    }

    if (questionsLoading) {
      return (
        <p className="lede r-up" role="status" style={{ marginTop: 24 }}>
          Loading the application form…
        </p>
      );
    }
    if (questionsError) {
      return (
        <p className="form-status form-error r-up" role="alert" style={{ marginTop: 24 }}>
          {questionsError}
        </p>
      );
    }
    return (
      <ApplicationForm
        target={{ kind: "position", id: position.id }}
        questions={questions}
        fingerprint={fingerprint}
        onSubmitted={(data, emailed) => setReceipt({ data, emailed })}
      />
    );
  };

  return (
    <>
      <PageMeta
        pathname={`/opportunities/${position.id}`}
        override={{
          title: `${position.title} | MUTIS Finance Society`,
          description: htmlToExcerpt(position.description, 160) || DEFAULT_DESCRIPTION,
        }}
      />

      <section className="page-hero">
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span>
              <Link to="/opportunities">Opportunities</Link><span>/</span>
              <span>{position.category}</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Opportunities</div>
            <h1 className="page-title r-up">{position.title}</h1>
          </div>
          <p className="page-sub r-up">
            {position.category} · {positionStatusLabel(position)}
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          {/* One measure for the whole stack. Without it each child stops at its
              own max-width and the description, the lede and the receipt all end
              at different places — see .position-apply-column. */}
          <div className="position-apply-column">
            <div className="event-signup-meta r-up">
              <span>{position.category}</span>
              <span>{positionStatusLabel(position)}</span>
            </div>

            <div
              className="article-body r-up"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(position.description) }}
            />

            <hr className="modal-divider" />

            <div className="page-eyebrow r-up"><span className="bar" />Apply</div>
            <h2 className="r-up">Apply for this position</h2>
            {open && !receipt && (
              <p className="lede r-up" style={{ marginBottom: 0 }}>
                Applications are read after the round closes, so this is an application rather than a sign-up.
                You'll get a receipt straight away and hear from us once we've read it.
              </p>
            )}

            {renderFormSlot()}
          </div>
        </div>
      </section>
    </>
  );
}
