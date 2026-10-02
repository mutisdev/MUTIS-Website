import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import {
  isQuestionType,
  MAX_CHOICE_OPTION_CHARS,
  MAX_CHOICE_OPTIONS,
  MAX_QUESTION_PROMPT_CHARS,
  MAX_QUESTIONS_PER_EVENT,
  MIN_CHOICE_OPTIONS,
  parseQuestionOptions,
  type QuestionType,
} from "@shared/eventApplications";

/**
 * A question as the builder holds it while the admin is editing. `id` is null
 * for a row that hasn't been saved yet, which is how saveQuestions tells an
 * insert from an update.
 */
export interface QuestionDraft {
  id: string | null;
  prompt: string;
  question_type: QuestionType;
  options: string[];
  /** Local key so React can track rows that have no id yet. */
  key: string;
}

export function emptyQuestionDraft(): QuestionDraft {
  return {
    id: null,
    prompt: "",
    question_type: "short_text",
    options: [],
    key: crypto.randomUUID(),
  };
}

type QuestionRow = Database["public"]["Tables"]["event_questions"]["Row"];

/**
 * Loads an event's saved questions, in display order. Whole rows rather than
 * just the editable fields, because they become the audit log's `before`
 * snapshot on an update or delete and that snapshot should be the row as it
 * actually was.
 *
 * Admins see these whether or not application mode is currently on, which is
 * what makes turning the toggle off non-destructive.
 */
export async function loadEventQuestions(eventId: string): Promise<QuestionRow[]> {
  const { data, error } = await supabase
    .from("event_questions")
    .select("*")
    .eq("event_id", eventId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** The editable view of saved rows, for the builder to work on. */
export function draftsFromRows(rows: QuestionRow[]): QuestionDraft[] {
  return rows.map((row) => ({
    id: row.id,
    prompt: row.prompt,
    // A type this build doesn't know about would otherwise render as a broken
    // field; fall back rather than crash the drawer.
    question_type: isQuestionType(row.question_type) ? row.question_type : "short_text",
    options: parseQuestionOptions(row.options),
    key: row.id,
  }));
}

/**
 * The rules the brief requires before an application-mode event can be saved:
 * at least one question, no empty prompts, at least two options on a choice
 * question. Returns a message per offending row key, plus a `form` message for
 * problems with the set as a whole.
 *
 * The database enforces the same rules (see the event_questions CHECK
 * constraints); this exists so the admin is told which row is wrong rather than
 * getting a constraint violation.
 */
export function validateQuestionDrafts(drafts: QuestionDraft[]): { form?: string; byKey: Record<string, string> } {
  const byKey: Record<string, string> = {};

  if (drafts.length === 0) {
    return { form: "Add at least one question, or turn off “Require application”.", byKey };
  }
  if (drafts.length > MAX_QUESTIONS_PER_EVENT) {
    return { form: `That's more than ${MAX_QUESTIONS_PER_EVENT} questions — applicants won't finish it.`, byKey };
  }

  for (const draft of drafts) {
    const prompt = draft.prompt.trim();
    if (!prompt) {
      byKey[draft.key] = "Write the question.";
      continue;
    }
    if (prompt.length > MAX_QUESTION_PROMPT_CHARS) {
      byKey[draft.key] = `Keep the question under ${MAX_QUESTION_PROMPT_CHARS} characters.`;
      continue;
    }
    if (draft.question_type !== "single_choice") continue;

    const options = draft.options.map((option) => option.trim()).filter(Boolean);
    if (options.length < MIN_CHOICE_OPTIONS) {
      byKey[draft.key] = `Choice questions need at least ${MIN_CHOICE_OPTIONS} options.`;
      continue;
    }
    if (options.length > MAX_CHOICE_OPTIONS) {
      byKey[draft.key] = `Choice questions take at most ${MAX_CHOICE_OPTIONS} options.`;
      continue;
    }
    if (options.some((option) => option.length > MAX_CHOICE_OPTION_CHARS)) {
      byKey[draft.key] = `Keep each option under ${MAX_CHOICE_OPTION_CHARS} characters.`;
      continue;
    }
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      byKey[draft.key] = "Two options are the same.";
    }
  }

  return { byKey };
}

/** The row values a draft persists as, with positions made dense from the
 * draft order. Blank options are dropped here so a trailing empty option box
 * never reaches the database. */
function rowValues(draft: QuestionDraft, index: number) {
  return {
    prompt: draft.prompt.trim(),
    question_type: draft.question_type,
    options: draft.question_type === "single_choice" ? draft.options.map((o) => o.trim()).filter(Boolean) : [],
    position: index,
  };
}

/** True when a saved row and its draft differ in anything that gets written. */
function hasChanged(
  draft: QuestionDraft,
  index: number,
  original: { prompt: string; question_type: string; options: string[]; position: number },
): boolean {
  const next = rowValues(draft, index);
  return (
    next.prompt !== original.prompt ||
    next.question_type !== original.question_type ||
    next.position !== original.position ||
    JSON.stringify(next.options) !== JSON.stringify(original.options)
  );
}

/** The slice of useAdminMutation this needs. Narrowed to event_questions so the
 * row shapes are checked rather than widened to Record<string, unknown>. */
type Mutation = {
  insertRow: (
    table: "event_questions",
    values: Database["public"]["Tables"]["event_questions"]["Insert"],
  ) => Promise<QuestionRow>;
  updateRow: (
    table: "event_questions",
    id: string,
    values: Database["public"]["Tables"]["event_questions"]["Update"],
    previousRow: QuestionRow,
  ) => Promise<QuestionRow>;
  deleteRow: (table: "event_questions", id: string, previousRow: QuestionRow) => Promise<void>;
};

/**
 * Persists the builder's drafts against what's currently saved: inserts rows
 * with no id, deletes saved rows the admin removed, and updates only the rows
 * whose content or position actually changed — so a drag that moves two rows
 * writes two audit entries, not one per question.
 *
 * Every write goes through useAdminMutation's helpers, which is what puts
 * question changes in the audit log without any logging code here.
 *
 * Deleting a question does NOT delete anyone's answer:
 * application_answers.question_id is ON DELETE SET NULL and the prompt is
 * snapshotted, so historic applications keep reading correctly.
 *
 * Positions are written one row at a time, which is why event_questions has no
 * unique index on (event_id, position) — the intermediate states are legal.
 */
export async function saveQuestionDrafts(
  eventId: string,
  drafts: QuestionDraft[],
  originalRows: QuestionRow[],
  mutation: Mutation,
): Promise<void> {
  const originalById = new Map(originalRows.map((row) => [row.id, row]));
  const keptIds = new Set(drafts.map((draft) => draft.id).filter((id): id is string => Boolean(id)));

  // Deletes first, so a position freed by a removed row is available to the
  // updates below.
  for (const [id, row] of originalById) {
    if (!keptIds.has(id)) {
      await mutation.deleteRow("event_questions", id, row);
    }
  }

  for (const [index, draft] of drafts.entries()) {
    if (!draft.id) {
      await mutation.insertRow("event_questions", { event_id: eventId, ...rowValues(draft, index) });
      continue;
    }
    const previous = originalById.get(draft.id);
    if (!previous) continue;
    if (
      hasChanged(draft, index, {
        prompt: previous.prompt,
        question_type: previous.question_type,
        options: parseQuestionOptions(previous.options),
        position: previous.position,
      })
    ) {
      await mutation.updateRow("event_questions", draft.id, rowValues(draft, index), previous);
    }
  }
}
