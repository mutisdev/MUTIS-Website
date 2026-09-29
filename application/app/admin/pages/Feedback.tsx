import { useEffect, useState } from "react";
import { Eye, MessageSquare, Percent, Star, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database, Json } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { usePageCache, hasCached } from "../usePageCache";
import { ChartCard } from "../components/dashboard/ChartCard";
import { BarList, type BarListItem } from "../components/dashboard/BarList";

type EventOption = Pick<Database["public"]["Tables"]["events"]["Row"], "id" | "title" | "starts_at">;

type SummaryRow = Database["public"]["Functions"]["attendance_feedback_summary"]["Returns"][number];

/** "all" and "other" are scopes; anything else is an event id. */
const ALL = "all";
const OTHER = "other";

export interface RatingBucket {
  rating: number;
  count: number;
}

export interface FeedbackComment {
  id: string;
  rating: number;
  comments: string;
  /** London calendar date, "YYYY-MM-DD". Day-granular by design — no time exists. */
  created_on: string;
}

/**
 * The generated Returns type marks every column non-nullable, which `returns
 * table` columns are not: event_id, event_title, response_rate and
 * average_rating are all null in ordinary cases (no event selected, no visitors
 * recorded, no submissions). Nullability is restated here rather than trusted
 * from the generated file.
 */
export interface FeedbackSummary {
  mode: string;
  event_id: string | null;
  event_title: string | null;
  range_start: string;
  range_end: string;
  unique_visitors: number;
  submissions_total: number;
  submissions_in_range: number;
  response_rate: number | null;
  average_rating: number | null;
  rating_distribution: RatingBucket[];
  recent_comments: FeedbackComment[];
}

function isRecord(value: Json): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBuckets(value: Json): RatingBucket[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const { rating, count } = entry;
    if (typeof rating !== "number" || typeof count !== "number") return [];
    return [{ rating, count }];
  });
}

function parseComments(value: Json): FeedbackComment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const { id, rating, comments, created_on } = entry;
    if (typeof id !== "string" || typeof rating !== "number") return [];
    if (typeof comments !== "string" || typeof created_on !== "string") return [];
    return [{ id, rating, comments, created_on }];
  });
}

function parseSummary(row: SummaryRow): FeedbackSummary {
  return {
    mode: row.mode,
    event_id: row.event_id ?? null,
    event_title: row.event_title ?? null,
    range_start: row.range_start,
    range_end: row.range_end,
    unique_visitors: row.unique_visitors,
    submissions_total: row.submissions_total,
    submissions_in_range: row.submissions_in_range,
    response_rate: row.response_rate ?? null,
    average_rating: row.average_rating ?? null,
    rating_distribution: parseBuckets(row.rating_distribution),
    recent_comments: parseComments(row.recent_comments),
  };
}

const nf = new Intl.NumberFormat("en-GB");

/** ISO date (YYYY-MM-DD) for a London calendar day, matching how the RPC buckets. */
const isoDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" });

function londonToday(offsetDays = 0): string {
  return isoDate.format(new Date(Date.now() + offsetDays * 86_400_000));
}

function formatDay(iso: string): string {
  // Parsed as a plain date, so render it as one — no timezone shifting.
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const RATING_LABELS: Record<number, string> = {
  1: "1 — Poor",
  2: "2",
  3: "3",
  4: "4",
  5: "5 — Excellent",
};

export function Feedback() {
  const toast = useToast();
  const [events, setEvents] = usePageCache<EventOption[]>("admin:feedback:events", []);
  const [selection, setSelection] = usePageCache<string>("admin:feedback:selection", ALL);
  const [from, setFrom] = usePageCache<string>("admin:feedback:from", londonToday(-29));
  const [to, setTo] = usePageCache<string>("admin:feedback:to", londonToday());
  const [summary, setSummary] = usePageCache<FeedbackSummary | null>("admin:feedback:summary", null);
  const [loading, setLoading] = useState(!hasCached("admin:feedback:summary"));

  const isEventMode = selection !== ALL && selection !== OTHER;

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("events")
      .select("id, title, starts_at")
      .order("starts_at", { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Could not load events.");
        if (data) setEvents(data);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One RPC call per filter change: every number on this page is aggregated in
  // Postgres, so there is nothing to recompute when the filter moves.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase
      .rpc("attendance_feedback_summary", {
        p_event_id: isEventMode ? selection : undefined,
        p_scope: isEventMode ? undefined : selection,
        p_from: isEventMode ? undefined : from,
        p_to: isEventMode ? undefined : to,
        p_comment_limit: 10,
      })
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Could not load the feedback summary.");
        setSummary(data ? parseSummary(data) : null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection, from, to]);

  const statCards = [
    { label: "Unique visitors", value: summary ? nf.format(summary.unique_visitors) : "—", icon: Eye },
    { label: "Submissions", value: summary ? nf.format(summary.submissions_in_range) : "—", icon: MessageSquare },
    {
      label: "Response rate",
      value:
        summary?.response_rate == null
          ? "—"
          : `${Math.round(summary.response_rate * 100)}%`,
      icon: Percent,
    },
    {
      label: "Average rating",
      value: summary?.average_rating == null ? "—" : `${summary.average_rating} / 5`,
      icon: Star,
    },
  ];

  const distribution: BarListItem[] = (summary?.rating_distribution ?? [])
    .slice()
    .sort((a, b) => b.rating - a.rating)
    .map((bucket) => ({
      key: String(bucket.rating),
      label: RATING_LABELS[bucket.rating] ?? String(bucket.rating),
      value: bucket.count,
    }));

  const windowLabel = summary
    ? summary.range_start === summary.range_end
      ? formatDay(summary.range_start)
      : `${formatDay(summary.range_start)} – ${formatDay(summary.range_end)}`
    : null;

  // Event mode describes every response carrying that event_id, but can only
  // count visitors over the event's own day — say so rather than letting the
  // rate read as exact.
  const lateResponses =
    summary && summary.submissions_total !== summary.submissions_in_range
      ? summary.submissions_total - summary.submissions_in_range
      : 0;

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Submissions</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Feedback</h1>
      <p className="mt-[12px] text-[14px] leading-[1.6] text-muted-foreground">
        Anonymous event feedback, aggregated. Responses carry no name or email, and only the day they were sent.
      </p>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <select
          value={selection}
          onChange={(e) => setSelection(e.target.value)}
          aria-label="Event or feedback scope"
          className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden transition-colors focus:border-accent"
        >
          <option value={ALL}>All feedback</option>
          <option value={OTHER}>Other (not listed)</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} — {formatDay(isoDate.format(new Date(ev.starts_at)))}
            </option>
          ))}
        </select>

        {!isEventMode && (
          <>
            <label className="flex items-center gap-[6px] text-[12px] text-muted-foreground">
              From
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-[10px] border border-input bg-input px-[10px] py-[8px] text-[13px]! text-foreground outline-hidden transition-colors focus:border-accent"
              />
            </label>
            <label className="flex items-center gap-[6px] text-[12px] text-muted-foreground">
              To
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-[10px] border border-input bg-input px-[10px] py-[8px] text-[13px]! text-foreground outline-hidden transition-colors focus:border-accent"
              />
            </label>
          </>
        )}

        {loading && <Loader2 className="h-[15px] w-[15px] animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-[24px] grid grid-cols-2 gap-[12px] xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-[14px] border border-border bg-card p-[16px]">
              <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[10px] border border-border bg-input text-accent">
                <Icon className="h-[15px] w-[15px]" />
              </span>
              <p className="mt-[12px] text-[22px] font-medium text-foreground">{card.value}</p>
              <p className="mt-[2px] text-[12px] text-muted-foreground">{card.label}</p>
            </div>
          );
        })}
      </div>

      {summary && (
        <p className="mt-[12px] text-[12px] leading-[1.6] text-muted-foreground">
          {isEventMode
            ? `Visitors counted on ${windowLabel}, the event's own day — page views aren't tied to an event, so this assumes no other event ran that day.`
            : `Visitors and responses counted ${windowLabel}.`}{" "}
          The response rate is responses per recorded visit and can exceed 100% — someone can answer from a second
          device, with storage blocked, or after midnight.
          {lateResponses > 0 &&
            ` ${nf.format(summary.submissions_total)} responses in total for this event, ${nf.format(lateResponses)} of them outside that day; ratings and comments below cover all of them.`}
        </p>
      )}

      <div className="mt-[24px] grid grid-cols-1 gap-[12px] xl:grid-cols-2">
        <ChartCard
          title="Rating distribution"
          subtitle={
            summary?.average_rating == null
              ? "How would you rate the event?"
              : `How would you rate the event? · ${nf.format(summary.submissions_total)} responses`
          }
        >
          {loading && summary === null ? (
            <ChartPlaceholder />
          ) : (
            <BarList items={distribution} empty="No responses in this range." />
          )}
        </ChartCard>

        <ChartCard title="Recent comments" subtitle="Newest first, to the day">
          {loading && summary === null ? (
            <ChartPlaceholder />
          ) : summary === null || summary.recent_comments.length === 0 ? (
            <EmptyState>No comments in this range.</EmptyState>
          ) : (
            <ul className="-my-[8px] divide-y divide-border">
              {summary.recent_comments.map((comment) => (
                <li key={comment.id} className="flex flex-col gap-[4px] py-[10px]">
                  <span className="flex items-center gap-[8px] text-[11px] text-muted-foreground">
                    <time dateTime={comment.created_on}>{formatDay(comment.created_on)}</time>
                    <span className="rounded-[6px] border border-border bg-input px-[6px] py-[1px] tabular-nums text-accent">
                      {comment.rating} / 5
                    </span>
                  </span>
                  <p className="whitespace-pre-wrap text-[13px] leading-[1.6] text-foreground">{comment.comments}</p>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartPlaceholder() {
  return (
    <div className="flex h-[180px] items-center justify-center text-muted-foreground">
      <Loader2 className="h-[18px] w-[18px] animate-spin" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center px-[16px] text-center text-[13px] leading-[1.6] text-muted-foreground">
      <p>{children}</p>
    </div>
  );
}
