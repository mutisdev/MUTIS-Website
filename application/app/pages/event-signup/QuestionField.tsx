import { MAX_ANSWER_CHARS, type ApplicationQuestion } from "@shared/eventApplications";

interface QuestionFieldProps {
  question: ApplicationQuestion;
  index: number;
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

/**
 * One admin-written question. Every question is mandatory — there is no
 * optional variant anywhere in this feature — so each one renders with the same
 * " *" marker the rest of the site's required fields use.
 *
 * Reuses the shared form classes rather than introducing any new styling:
 * .field for the text types and the fieldset/.field-radios pattern from
 * Attendance.tsx for single choice.
 */
export function QuestionField({ question, index, value, onChange, error }: QuestionFieldProps) {
  const id = `app-q-${index}`;
  const errorId = `${id}-error`;

  const errorNode = error ? (
    <span id={errorId} className="field-error" role="alert">
      {error}
    </span>
  ) : null;

  if (question.question_type === "single_choice") {
    // A radio group's accessible name comes from the legend, so the prompt goes
    // there rather than in a <label>.
    return (
      <div className="field">
        <fieldset
          className="field-radios"
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        >
          <legend>{question.prompt} *</legend>
          <div className="radio-row">
            {question.options.map((option) => (
              <label key={option}>
                <input
                  type="radio"
                  name={id}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  required
                />
                {option}
              </label>
            ))}
          </div>
        </fieldset>
        {errorNode}
      </div>
    );
  }

  const isLong = question.question_type === "long_text";

  return (
    <div className="field">
      <label htmlFor={id}>{question.prompt} *</label>
      {isLong ? (
        <textarea
          id={id}
          name={id}
          required
          maxLength={MAX_ANSWER_CHARS}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      ) : (
        <input
          id={id}
          name={id}
          type="text"
          required
          maxLength={MAX_ANSWER_CHARS}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : undefined}
        />
      )}
      {errorNode}
    </div>
  );
}
