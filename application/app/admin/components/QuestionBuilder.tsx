import { FileText, Lock, Plus, Trash2, X } from "lucide-react";
import {
  CV_RETENTION_DAYS,
  formatFileSize,
  CV_MAX_BYTES,
  MAX_CHOICE_OPTIONS,
  MAX_QUESTION_PROMPT_CHARS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  type QuestionType,
} from "@shared/eventApplications";
import { ReorderableList } from "./ReorderableList";
import { emptyQuestionDraft, type QuestionDraft } from "../lib/eventQuestions";

interface QuestionBuilderProps {
  value: QuestionDraft[];
  onChange: (next: QuestionDraft[]) => void;
  /** Per-row validation messages, keyed by draft.key. */
  errors: Record<string, string>;
  /** A problem with the set as a whole (e.g. no questions at all). */
  formError?: string;
  /** Shown as a warning when the event already has applications, because
   * edits can't change answers that have already been received. */
  applicationCount?: number;
}

const inputClass =
  "w-full rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent";

/**
 * Builds an event's application questions. The list starts empty — there are no
 * default questions — and every question is mandatory, so no optional flag is
 * offered anywhere here.
 *
 * Drafts are staged in the parent's form state and only written when the event
 * is saved (unlike PdfUploader, which uploads on selection), so Cancel really
 * discards and useDrawerFormCache's dirty tracking keeps working.
 */
export function QuestionBuilder({ value, onChange, errors, formError, applicationCount = 0 }: QuestionBuilderProps) {
  const update = (key: string, patch: Partial<QuestionDraft>) =>
    onChange(value.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  const changeType = (key: string, nextType: QuestionType) =>
    onChange(
      value.map((draft) =>
        draft.key === key
          ? {
              ...draft,
              question_type: nextType,
              // Switching to choice seeds the two options it must have;
              // switching away drops them, as the database requires none.
              options: nextType === "single_choice" ? (draft.options.length ? draft.options : ["", ""]) : [],
            }
          : draft,
      ),
    );

  return (
    <div className="flex flex-col gap-[12px]">
      {applicationCount > 0 && (
        <p className="rounded-[10px] border border-border bg-input px-[12px] py-[10px] text-[12px] leading-[1.6] text-muted-foreground">
          {applicationCount} application{applicationCount === 1 ? " has" : "s have"} already been received.
          Editing these questions won't change answers already given — each answer keeps the wording it
          was asked under.
        </p>
      )}

      {value.length > 0 && (
        <ReorderableList
          items={value}
          keyField={(draft) => draft.key}
          onReorder={(orderedKeys) =>
            onChange(
              orderedKeys
                .map((key) => value.find((draft) => draft.key === key))
                .filter((draft): draft is QuestionDraft => Boolean(draft)),
            )
          }
          renderRow={(draft) => {
            const error = errors[draft.key];
            const remaining = MAX_QUESTION_PROMPT_CHARS - draft.prompt.trim().length;
            return (
              <div className="flex flex-col gap-[10px] py-[12px] pr-[12px]">
                <div className="flex flex-wrap items-start gap-[8px]">
                  <div className="min-w-[200px] flex-1">
                    <input
                      type="text"
                      value={draft.prompt}
                      maxLength={MAX_QUESTION_PROMPT_CHARS}
                      placeholder="e.g. Why do you want to attend?"
                      onChange={(e) => update(draft.key, { prompt: e.target.value })}
                      aria-invalid={error ? "true" : undefined}
                      aria-label="Question"
                      className={inputClass}
                    />
                  </div>
                  <select
                    value={draft.question_type}
                    onChange={(e) => changeType(draft.key, e.target.value as QuestionType)}
                    aria-label="Answer type"
                    className="rounded-[10px] border border-input bg-input px-[10px] py-[10px] text-[13px]! text-foreground outline-hidden"
                  >
                    {QUESTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {QUESTION_TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onChange(value.filter((other) => other.key !== draft.key))}
                    aria-label="Delete question"
                    className="rounded-[8px] p-[8px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-[14px] w-[14px]" />
                  </button>
                </div>

                {draft.question_type === "single_choice" && (
                  <div className="flex flex-col gap-[6px] pl-[2px]">
                    {draft.options.map((option, index) => (
                      <div key={index} className="flex items-center gap-[6px]">
                        <input
                          type="text"
                          value={option}
                          placeholder={`Option ${index + 1}`}
                          aria-label={`Option ${index + 1}`}
                          onChange={(e) =>
                            update(draft.key, {
                              options: draft.options.map((other, i) => (i === index ? e.target.value : other)),
                            })
                          }
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            update(draft.key, { options: draft.options.filter((_, i) => i !== index) })
                          }
                          aria-label={`Remove option ${index + 1}`}
                          className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-[13px] w-[13px]" />
                        </button>
                      </div>
                    ))}
                    {draft.options.length < MAX_CHOICE_OPTIONS && (
                      <button
                        type="button"
                        onClick={() => update(draft.key, { options: [...draft.options, ""] })}
                        className="self-start rounded-[8px] px-[8px] py-[6px] text-[12px]! font-medium text-accent transition-colors hover:bg-white/5"
                      >
                        + Add option
                      </button>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  {error ? (
                    <span className="text-[12px] text-destructive" role="alert">
                      {error}
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Required — every question must be answered.</span>
                  )}
                  {remaining < 60 && (
                    <span className="text-[11px] text-muted-foreground tabular-nums">{remaining} left</span>
                  )}
                </div>
              </div>
            );
          }}
        />
      )}

      {/*
        The CV row. Part of application mode and always mandatory, so it's shown
        as a fixed row an admin can see but not reorder, edit or remove — rather
        than being invisible and surprising.
      */}
      <div className="flex items-start gap-[10px] rounded-[12px] border border-dashed border-border bg-input/40 px-[14px] py-[12px]">
        <FileText className="mt-[2px] h-[15px] w-[15px] shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">
            CV upload
            <span className="ml-[8px] inline-flex items-center gap-[4px] align-middle text-[10px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              <Lock className="h-[11px] w-[11px]" />
              Always included
            </span>
          </p>
          <p className="mt-[4px] text-[11px] leading-[1.6] text-muted-foreground">
            PDF only, up to {formatFileSize(CV_MAX_BYTES)}. Stored privately, visible only to admins
            through a short-lived link, and deleted {CV_RETENTION_DAYS} days after the event.
          </p>
        </div>
      </div>

      {formError && (
        <p className="text-[12px] text-destructive" role="alert">
          {formError}
        </p>
      )}

      <button
        type="button"
        onClick={() => onChange([...value, emptyQuestionDraft()])}
        className="inline-flex items-center gap-[6px] self-start rounded-[10px] border border-border px-[12px] py-[9px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5"
      >
        <Plus className="h-[14px] w-[14px]" />
        Add custom question
      </button>
    </div>
  );
}
