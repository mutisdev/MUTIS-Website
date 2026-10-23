import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  isQuestionType,
  parseQuestionOptions,
  questionsFingerprint,
  type ApplicationQuestion,
  type ApplicationTarget,
} from "@shared/eventApplications";

/**
 * Loads a target's application questions in display order — an event's or a
 * position's.
 *
 * RLS only returns rows while applications are actually open: for an event,
 * published AND in application mode; for a position, published AND
 * applications_open AND not past closes_at. So a closed round's questions are
 * hidden without this hook needing to know, and without any row being deleted.
 *
 * That means an empty list is ambiguous — it can mean "closed" or "never set
 * up" — so a caller must say which from the parent row (positions.closes_at /
 * applications_open), never infer it from a zero count here.
 *
 * A row whose question_type isn't one the frontend understands is dropped
 * rather than rendered as a broken field; that can only happen if the database
 * gains a type this build predates.
 */
export function useEventQuestions(target: ApplicationTarget | undefined, enabled: boolean) {
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  // Primitives, so the effect doesn't re-run on every render just because the
  // caller built a fresh target object.
  const targetKind = target?.kind;
  const targetId = target?.id;

  useEffect(() => {
    if (!targetKind || !targetId || !enabled) {
      setQuestions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    const load = async () => {
      const { data, error: fetchError } = await supabase
        .from("event_questions")
        .select("id, prompt, question_type, options, position")
        .eq(targetKind === "event" ? "event_id" : "position_id", targetId)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        console.error("Failed to load application questions", fetchError);
        setError("We couldn't load the application questions. Please refresh the page.");
        setQuestions([]);
      } else {
        setQuestions(
          (data ?? []).flatMap((row) =>
            isQuestionType(row.question_type)
              ? [
                  {
                    id: row.id,
                    prompt: row.prompt,
                    question_type: row.question_type,
                    options: parseQuestionOptions(row.options),
                    position: row.position,
                  },
                ]
              : [],
          ),
        );
      }
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [targetKind, targetId, enabled]);

  return { questions, loading, error, fingerprint: questionsFingerprint(questions) };
}
