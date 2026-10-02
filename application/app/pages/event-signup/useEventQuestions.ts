import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  isQuestionType,
  parseQuestionOptions,
  questionsFingerprint,
  type ApplicationQuestion,
} from "@shared/eventApplications";

/**
 * Loads an event's application questions in display order.
 *
 * RLS only returns rows for events that are published AND in application mode,
 * so turning the toggle off hides the questions without this page needing to
 * know — and without any row being deleted. A row whose question_type isn't one
 * the frontend understands is dropped rather than rendered as a broken field;
 * that can only happen if the database gains a type this build predates.
 */
export function useEventQuestions(eventId: string | undefined, enabled: boolean) {
  const [questions, setQuestions] = useState<ApplicationQuestion[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!eventId || !enabled) {
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
        .eq("event_id", eventId)
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
  }, [eventId, enabled]);

  return { questions, loading, error, fingerprint: questionsFingerprint(questions) };
}
