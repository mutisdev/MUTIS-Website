import { Download } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { Database } from "@/lib/database.types";
import {
  ETHNICITY_GROUPS,
  ETHNICITY_PREFER_NOT_TO_SAY,
  CONTEXTUAL_OFFER_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  FIRST_GENERATION_OPTIONS,
  FREE_SCHOOL_MEALS_OPTIONS,
} from "@/app/data/diversityOptions";
import { ChartCard, tooltipProps } from "./dashboard/ChartCard";
import { downloadCsv } from "./DataTable";

type CountRow = Database["public"]["Tables"]["diversity_answer_counts"]["Row"];
type Option = { value: string; label: string };

// Categorical slots, in fixed order (dark steps from the dataviz reference
// palette, validated against the admin card surface #0f1219: worst adjacent
// CVD ΔE 8.4, every slot ≥ 3:1). A colour belongs to an answer, never to its
// rank, so it stays the same however the counts change.
const SLOT_COLORS = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
// "No answer" is missing data, not a category — neutral grey.
const NO_ANSWER_COLOR = "#898781";
// Matches the card surface so slices get a 2px gap between them.
const SURFACE = "#0f1219";

const NO_ANSWER = "no_answer";

interface Slice {
  key: string;
  label: string;
  color: string;
  count: number;
}

interface DetailRow {
  label: string;
  count: number;
  /** Slice this answer belongs to (for its colour dot). */
  sliceKey: string;
}

interface Question {
  key: string;
  title: string;
  slices: Omit<Slice, "count">[];
  /** Maps a stored answer value to its slice key and display label. */
  resolve: (answer: string) => { sliceKey: string; label: string };
  /** Every possible answer, in form order, for the CSV (zeros included). */
  allAnswers: Option[];
}

function simpleQuestion(key: string, title: string, options: Option[]): Question {
  return {
    key,
    title,
    slices: [
      ...options.map((o, i) => ({ key: o.value, label: o.label, color: SLOT_COLORS[i] })),
      { key: NO_ANSWER, label: "No answer", color: NO_ANSWER_COLOR },
    ],
    resolve: (answer) => {
      if (answer === NO_ANSWER) return { sliceKey: NO_ANSWER, label: "No answer" };
      const match = options.find((o) => o.value === answer);
      // An answer the form no longer offers keeps its raw text in the table and sits in the grey slice.
      return match ? { sliceKey: match.value, label: match.label } : { sliceKey: NO_ANSWER, label: answer };
    },
    allAnswers: [...options, { value: NO_ANSWER, label: "No answer" }],
  };
}

// Ethnicity has too many options for one slice each, so the pie shows the
// broad groups; the table beside it still gives every answer's exact count.
const ETHNICITY_QUESTION: Question = {
  key: "ethnicity",
  title: "Ethnic background",
  slices: [
    ...ETHNICITY_GROUPS.map((g, i) => ({ key: g.group, label: g.group, color: SLOT_COLORS[i] })),
    { key: ETHNICITY_PREFER_NOT_TO_SAY.value, label: ETHNICITY_PREFER_NOT_TO_SAY.label, color: SLOT_COLORS[ETHNICITY_GROUPS.length] },
    { key: NO_ANSWER, label: "No answer", color: NO_ANSWER_COLOR },
  ],
  resolve: (answer) => {
    if (answer === NO_ANSWER) return { sliceKey: NO_ANSWER, label: "No answer" };
    if (answer === ETHNICITY_PREFER_NOT_TO_SAY.value) {
      return { sliceKey: answer, label: ETHNICITY_PREFER_NOT_TO_SAY.label };
    }
    for (const g of ETHNICITY_GROUPS) {
      const match = g.options.find((o) => o.value === answer);
      if (match) return { sliceKey: g.group, label: `${g.group}: ${match.label}` };
    }
    return { sliceKey: NO_ANSWER, label: answer };
  },
  allAnswers: [
    ...ETHNICITY_GROUPS.flatMap((g) => g.options.map((o) => ({ value: o.value, label: `${g.group}: ${o.label}` }))),
    ETHNICITY_PREFER_NOT_TO_SAY,
    { value: NO_ANSWER, label: "No answer" },
  ],
};

const QUESTIONS: Question[] = [
  ETHNICITY_QUESTION,
  simpleQuestion("contextual_offer_eligible", "Eligible for a contextual offer", CONTEXTUAL_OFFER_OPTIONS),
  simpleQuestion("school_type", "Type of school attended", SCHOOL_TYPE_OPTIONS),
  simpleQuestion("first_generation_student", "First-generation university student", FIRST_GENERATION_OPTIONS),
  simpleQuestion("free_school_meals", "Eligible for free school meals", FREE_SCHOOL_MEALS_OPTIONS),
];

const pct = (count: number, total: number) => (total ? `${Math.round((count / total) * 1000) / 10}%` : "—");

/**
 * Anonymous diversity totals from diversity_answer_counts: one pie per
 * question, with exact counts beside it and a CSV export of every answer.
 * Totals never go down when a member is deleted.
 */
export function DiversitySummary({ counts }: { counts: CountRow[] }) {
  const exportCsv = () => {
    const rows: (string | number)[][] = [];
    for (const q of QUESTIONS) {
      for (const a of q.allAnswers) {
        const count = counts.find((c) => c.question === q.key && c.answer === a.value)?.count ?? 0;
        rows.push([q.title, a.label, count]);
      }
      // Anything stored that the form no longer offers, so nothing is left out.
      for (const c of counts) {
        if (c.question === q.key && !q.allAnswers.some((a) => a.value === c.answer)) rows.push([q.title, c.answer, c.count]);
      }
    }
    downloadCsv("diversity-totals.csv", ["Question", "Answer", "Count"], rows);
  };

  return (
    <section aria-labelledby="diversity-heading">
      <div className="flex flex-wrap items-end justify-between gap-[12px]">
        <div>
          <h2 id="diversity-heading" className="text-[16px] font-medium text-foreground">
            Diversity summary
          </h2>
          <p className="mt-[4px] max-w-[620px] text-[12px] leading-[1.6] text-muted-foreground">
            Anonymous totals of how members answered. Answers aren&apos;t stored against anyone, and the totals
            don&apos;t go down if a member record is deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex items-center gap-[6px] rounded-[10px] border border-border bg-card px-[12px] py-[8px] text-[12px] font-medium text-foreground transition-colors hover:bg-white/[0.03]"
        >
          <Download className="h-[14px] w-[14px]" />
          Export CSV
        </button>
      </div>

      <div className="mt-[16px] grid grid-cols-1 gap-[12px] xl:grid-cols-2">
        {QUESTIONS.map((q) => (
          <QuestionCard key={q.key} question={q} counts={counts.filter((c) => c.question === q.key)} />
        ))}
      </div>
    </section>
  );
}

function QuestionCard({ question, counts }: { question: Question; counts: CountRow[] }) {
  const total = counts.reduce((n, c) => n + c.count, 0);

  const sliceCounts = new Map<string, number>();
  const details: DetailRow[] = [];
  for (const c of counts) {
    if (c.count === 0) continue;
    const { sliceKey, label } = question.resolve(c.answer);
    sliceCounts.set(sliceKey, (sliceCounts.get(sliceKey) ?? 0) + c.count);
    details.push({ label, count: c.count, sliceKey });
  }

  // Form order, not size order, so each slice keeps its place and colour.
  const slices: Slice[] = question.slices
    .map((s) => ({ ...s, count: sliceCounts.get(s.key) ?? 0 }))
    .filter((s) => s.count > 0);
  const sliceIndex = new Map(question.slices.map((s, i) => [s.key, i]));
  details.sort((a, b) => (sliceIndex.get(a.sliceKey)! - sliceIndex.get(b.sliceKey)!) || b.count - a.count);
  const colorOf = new Map(question.slices.map((s) => [s.key, s.color]));

  return (
    <ChartCard title={question.title} subtitle={`${total} ${total === 1 ? "member" : "members"}`}>
      {total === 0 ? (
        <p className="py-[24px] text-center text-[13px] text-muted-foreground">No answers yet.</p>
      ) : (
        <div className="flex flex-col gap-[16px] sm:flex-row sm:items-start">
          <div className="mx-auto h-[168px] w-[168px] shrink-0" role="img" aria-label={`${question.title} pie chart. Exact counts are in the table beside it.`}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="count"
                  nameKey="label"
                  outerRadius="100%"
                  stroke={SURFACE}
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={false}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  {...tooltipProps}
                  cursor={false}
                  formatter={(value, name) => [`${value} (${pct(Number(value), total)})`, String(name)]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <table className="w-full min-w-0 border-collapse text-left text-[12px]">
            <caption className="sr-only">{question.title}: exact count for every answer given</caption>
            <thead>
              <tr className="border-b border-border text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
                <th scope="col" className="py-[6px] pr-[8px] font-medium">Answer</th>
                <th scope="col" className="py-[6px] pr-[8px] text-right font-medium">Count</th>
                <th scope="col" className="py-[6px] text-right font-medium">Share</th>
              </tr>
            </thead>
            <tbody>
              {details.map((d) => (
                <tr key={d.label} className="border-b border-border last:border-b-0">
                  <td className="py-[6px] pr-[8px] text-foreground">
                    <span className="flex items-start gap-[8px]">
                      <span
                        aria-hidden="true"
                        className="mt-[4px] h-[8px] w-[8px] shrink-0 rounded-full"
                        style={{ background: colorOf.get(d.sliceKey) }}
                      />
                      {d.label}
                    </span>
                  </td>
                  <td className="py-[6px] pr-[8px] text-right tabular-nums text-foreground">{d.count}</td>
                  <td className="py-[6px] text-right tabular-nums text-muted-foreground">{pct(d.count, total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}
