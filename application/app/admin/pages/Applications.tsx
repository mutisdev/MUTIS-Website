import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Download, FileText, Loader2, Search, ShieldAlert } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import {
  APPLICATION_STATUSES,
  CV_BUCKET,
  CV_RETENTION_DAYS,
  CV_SIGNED_URL_SECONDS,
  formatFileSize,
  isQuestionType,
  type ApplicationStatus,
} from "@shared/eventApplications";
import { useToast } from "../components/Toast";
import { useAuth } from "../AuthProvider";
import { Drawer } from "../components/Drawer";
import { DataTable, downloadCsv, type DataTableColumn } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { usePageCache, hasCached } from "../usePageCache";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type ApplicationRow = Database["public"]["Tables"]["event_applications"]["Row"];
type AnswerRow = Database["public"]["Tables"]["application_answers"]["Row"];

/** An application with its answers, as the nested select returns it. */
type Application = ApplicationRow & { application_answers: AnswerRow[] };

/** One CSV / detail column: a question, identified by its id where the question
 * still exists and by its snapshot prompt where it doesn't. */
interface QuestionColumn {
  key: string;
  prompt: string;
  /** True for a column that only exists in historic answers because the
   * question was deleted — shown so an admin isn't confused by it. */
  deleted: boolean;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Applications() {
  const toast = useToast();
  const { session } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [events, setEvents] = usePageCache<EventRow[]>("admin:applications:events", []);
  const [applications, setApplications] = usePageCache<Application[]>("admin:applications:rows", []);
  const [questions, setQuestions] = usePageCache<Database["public"]["Tables"]["event_questions"]["Row"][]>(
    "admin:applications:questions",
    []
  );
  const [loading, setLoading] = useState(!hasCached("admin:applications:events"));
  const [loadingRows, setLoadingRows] = useState(false);

  // The event comes from the URL so the Events page can link straight to it and
  // the choice survives a refresh.
  const eventId = searchParams.get("event") ?? "";
  const [statusFilter, setStatusFilter] = usePageCache("admin:applications:statusFilter", "all");
  const [search, setSearch] = usePageCache("admin:applications:search", "");

  const [detail, setDetail] = useState<Application | null>(null);
  const [cvLoadingId, setCvLoadingId] = useState<string | null>(null);

  const selectedEvent = events.find((e) => e.id === eventId) ?? null;

  // Only events in application mode. An event whose toggle was turned off still
  // appears while it has applications, so past rounds stay reachable.
  const applicationEvents = useMemo(
    () => events.filter((e) => e.requires_application).sort((a, b) => b.starts_at.localeCompare(a.starts_at)),
    [events]
  );

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("events")
      .select("*")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Could not load events.");
        else setEvents(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default to the most recent application-mode event rather than showing an
  // empty page with a dropdown nobody has touched.
  useEffect(() => {
    if (!eventId && applicationEvents.length > 0) {
      setSearchParams({ event: applicationEvents[0].id }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, applicationEvents.length]);

  useEffect(() => {
    if (!eventId) {
      setApplications([]);
      setQuestions([]);
      return;
    }
    let cancelled = false;
    setLoadingRows(true);

    const load = async () => {
      const [applicationsRes, questionsRes] = await Promise.all([
        supabase
          .from("event_applications")
          .select("*, application_answers(*)")
          .eq("event_id", eventId)
          .order("submitted_at", { ascending: false }),
        supabase
          .from("event_questions")
          .select("*")
          .eq("event_id", eventId)
          .order("position", { ascending: true })
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (applicationsRes.error) toast.error("Could not load applications.");
      else setApplications(applicationsRes.data as Application[]);
      if (questionsRes.error) toast.error("Could not load the questions.");
      else setQuestions(questionsRes.data);
      setLoadingRows(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  /**
   * event_applications isn't in useAdminMutation's ContentTable (only `status`
   * is updatable, and this page owns its own fetch shape), so status changes and
   * CV views are logged here — the same approach Submissions.tsx takes for
   * alumni_submissions.
   */
  const logApplicationAction = async (
    rowId: string,
    action: "update" | "view",
    before: unknown,
    after: unknown
  ) => {
    const { error } = await supabase.from("audit_log").insert({
      actor_user_id: session?.user.id ?? null,
      actor_email: session?.user.email ?? "unknown",
      table_name: "event_applications",
      row_id: rowId,
      action,
      before: before as never,
      after: after as never,
    });
    // Best-effort, like every other audit write here: a logging failure must not
    // undo a change that already succeeded.
    if (error) console.error(`Failed to write audit log entry for event_applications/${rowId}`, error);
  };

  const updateStatus = async (row: Application, status: ApplicationStatus) => {
    const { error } = await supabase.from("event_applications").update({ status }).eq("id", row.id);
    if (error) {
      toast.error("Could not update that status.");
      return;
    }
    setApplications((prev) => prev.map((r) => (r.id === row.id ? { ...r, status } : r)));
    setDetail((prev) => (prev && prev.id === row.id ? { ...prev, status } : prev));
    toast.success(`Marked ${status}.`);
    void logApplicationAction(row.id, "update", { status: row.status }, { status });
    // TODO(decision-emails): applicants are NOT told about this change. Accept /
    // waitlist / reject notification emails are deliberately out of scope for
    // this task — whoever builds them should send from here (or from a trigger
    // on this column) and must keep the "not a confirmed place" wording of the
    // receipt in mind, since an applicant may have printed it.
    //
    // TODO(video-details): the acceptance email is also where an online event's
    // "Joining online" block belongs. It is deliberately withheld from the
    // application receipt — a receipt is not a place — and an accepted
    // application does not become an event_signups row, so neither the
    // confirmation nor the reminders reach these applicants at all today. See
    // the matching notes in supabase/functions/send-signup-confirmation and
    // send-event-reminders; videoDetailsBlock() in _shared/sendEmail.ts renders
    // the block for whichever email ends up carrying it.
  };

  /**
   * Opens a CV through a signed URL — the bucket is private, so this is the only
   * way to reach one.
   *
   * Two modes, because reviewing and keeping are different jobs:
   * - "view" serves the PDF inline, so it opens in the browser's own viewer in a
   *   new tab and can be read next to the answers.
   * - "download" sets a Content-Disposition filename, so it saves as the file the
   *   applicant actually sent rather than as <uuid>.pdf, and can be filed
   *   wherever the committee keeps its shortlists.
   *
   * Both are audited before the link is minted. The URL itself is never rendered
   * into the page or kept in state: it's a bearer credential for one PDF.
   */
  const openCv = async (row: Application, mode: "view" | "download") => {
    if (!row.cv_path) return;
    setCvLoadingId(`${row.id}:${mode}`);
    try {
      await logApplicationAction(row.id, "view", null, {
        cv_path: row.cv_path,
        event_id: row.event_id,
        access: mode,
      });
      const { data, error } = await supabase.storage
        .from(CV_BUCKET)
        .createSignedUrl(row.cv_path, CV_SIGNED_URL_SECONDS,
          // Supabase turns this into the download filename; omitting it entirely
          // is what makes the other mode render inline.
          mode === "download" ? { download: row.cv_file_name } : undefined);
      if (error || !data) {
        console.error("Could not sign CV URL", row.cv_path, error);
        toast.error(mode === "download" ? "Could not download that CV." : "Could not open that CV.");
        return;
      }
      if (mode === "download") {
        // A plain anchor click rather than window.open: a download shouldn't
        // leave a blank tab behind.
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.download = row.cv_file_name;
        link.click();
      } else {
        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      }
    } finally {
      setCvLoadingId(null);
    }
  };

  /**
   * The question columns for the current event: the live questions in position
   * order, then any prompt that only survives in historic answers because its
   * question was deleted. Answers are matched by question_id where it still
   * points somewhere, and by the snapshot prompt where it doesn't — which is why
   * the prompt and position are stored on every answer.
   */
  const questionColumns = useMemo<QuestionColumn[]>(() => {
    const columns: QuestionColumn[] = questions
      .filter((q) => isQuestionType(q.question_type))
      .map((q) => ({ key: `id:${q.id}`, prompt: q.prompt, deleted: false }));

    const seenPrompts = new Set(columns.map((c) => c.prompt));
    const orphans = new Map<string, number>();
    for (const application of applications) {
      for (const answer of application.application_answers) {
        const stillLive = answer.question_id && questions.some((q) => q.id === answer.question_id);
        if (stillLive || seenPrompts.has(answer.question_prompt)) continue;
        if (!orphans.has(answer.question_prompt)) orphans.set(answer.question_prompt, answer.question_position);
      }
    }
    for (const [prompt] of [...orphans].sort((a, b) => a[1] - b[1])) {
      columns.push({ key: `prompt:${prompt}`, prompt, deleted: true });
    }
    return columns;
  }, [questions, applications]);

  const answerFor = (application: Application, column: QuestionColumn): string => {
    const answers = application.application_answers;
    if (column.key.startsWith("id:")) {
      const id = column.key.slice(3);
      const byId = answers.find((a) => a.question_id === id);
      if (byId) return byId.answer_text;
    }
    // Falls back to the snapshot prompt, which covers answers given before a
    // question was deleted and re-added.
    return answers.find((a) => a.question_prompt === column.prompt)?.answer_text ?? "";
  };

  const orderedAnswers = (application: Application) =>
    [...application.application_answers].sort((a, b) => a.question_position - b.question_position);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!q) return true;
      return row.name.toLowerCase().includes(q) || row.email.toLowerCase().includes(q);
    });
  }, [applications, statusFilter, search]);

  /**
   * CSV export. One column per question, headed by the prompt snapshot, plus
   * status and reference code.
   *
   * Deliberately NOT built with DataTable's exportFilename: the header row is
   * dynamic. And deliberately containing no cv_path, signed URL or file name —
   * an exported spreadsheet gets emailed around, and a CV must stay behind an
   * admin session.
   */
  const exportCsv = () => {
    const header = ["Reference code", "Status", "Submitted", "Name", "Email", ...questionColumns.map((c) => c.prompt)];
    const rows = filtered.map((application) => [
      application.reference_code,
      application.status,
      formatDateTime(application.submitted_at),
      application.name,
      application.email,
      ...questionColumns.map((column) => answerFor(application, column)),
    ]);
    const slug = (selectedEvent?.title ?? "event").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    downloadCsv(`applications-${slug || "event"}.csv`, header, rows);
  };

  const columns: DataTableColumn<Application>[] = [
    {
      key: "submitted_at",
      label: "Submitted",
      render: (r) => formatDateTime(r.submitted_at),
      sortValue: (r) => r.submitted_at,
    },
    {
      key: "reference_code",
      label: "Reference",
      render: (r) => <span className="font-mono text-[12px]">{r.reference_code}</span>,
      sortValue: (r) => r.reference_code,
    },
    { key: "name", label: "Name", render: (r) => r.name, sortValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email, sortValue: (r) => r.email },
    {
      key: "status",
      label: "Status",
      sortValue: (r) => r.status,
      render: (r) => (
        <select
          value={r.status}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => void updateStatus(r, e.target.value as ApplicationStatus)}
          aria-label={`Status for ${r.name}`}
          className="rounded-[8px] border border-input bg-input px-[8px] py-[5px] text-[12px]! text-foreground outline-hidden"
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "cv",
      label: "CV",
      render: (r) =>
        r.cv_path ? (
          <span className="inline-flex items-center gap-[4px]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void openCv(r, "view");
              }}
              className="inline-flex items-center gap-[5px] rounded-[8px] border border-border px-[8px] py-[5px] text-[12px] font-medium text-foreground transition-colors hover:bg-white/5"
            >
              {cvLoadingId === `${r.id}:view` ? (
                <Loader2 className="h-[12px] w-[12px] animate-spin" />
              ) : (
                <FileText className="h-[12px] w-[12px]" />
              )}
              View
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void openCv(r, "download");
              }}
              aria-label={`Download ${r.cv_file_name}`}
              title={`Download ${r.cv_file_name}`}
              className="inline-flex items-center rounded-[8px] border border-border p-[6px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
            >
              {cvLoadingId === `${r.id}:download` ? (
                <Loader2 className="h-[12px] w-[12px] animate-spin" />
              ) : (
                <Download className="h-[12px] w-[12px]" />
              )}
            </button>
          </span>
        ) : (
          <span className="text-[12px] text-muted-foreground">Deleted</span>
        ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center px-[24px] py-[96px] text-muted-foreground">
        <Loader2 className="h-[18px] w-[18px] animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Submissions</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Applications</h1>

      {applicationEvents.length === 0 ? (
        <div className="mt-[24px] rounded-[16px] border border-border bg-card px-[24px] py-[48px] text-center text-[13px] text-muted-foreground">
          No events are in application mode yet. Turn on “Require application” when editing an event.
        </div>
      ) : (
        <>
          <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
            <select
              value={eventId}
              onChange={(e) => setSearchParams({ event: e.target.value }, { replace: true })}
              aria-label="Event"
              className="max-w-[320px] rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden"
            >
              {applicationEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.title}
                </option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-[240px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Status"
              className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden"
            >
              <option value="all">All statuses</option>
              {APPLICATION_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {filtered.length} of {applications.length}
            </span>
          </div>

          <div className="mt-[24px]">
            {loadingRows ? (
              <div className="flex items-center justify-center py-[48px] text-muted-foreground">
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
              </div>
            ) : (
              <DataTable
                columns={columns}
                data={filtered}
                keyField={(r) => r.id}
                onRowClick={setDetail}
                emptyMessage="No applications for this event yet."
                pageSize={50}
                pageResetKey={`${eventId}|${statusFilter}|${search}`}
                toolbar={
                  applications.length > 0 ? (
                    <button
                      type="button"
                      onClick={exportCsv}
                      className="inline-flex items-center gap-[6px] rounded-[10px] border border-border bg-card px-[12px] py-[8px] text-[12px] font-medium text-foreground transition-colors hover:bg-white/[0.03]"
                    >
                      Export CSV
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
        </>
      )}

      <Drawer open={detail !== null} title="Application" onClose={() => setDetail(null)} widthClass="max-w-[560px]">
        {detail && (
          <div className="flex flex-col gap-[20px]">
            <div className="flex flex-wrap items-center justify-between gap-[12px]">
              <span className="font-mono text-[14px] text-foreground">{detail.reference_code}</span>
              <StatusBadge status={detail.status} />
            </div>

            <Detail label="Submitted" value={formatDateTime(detail.submitted_at)} />
            <Detail label="Name" value={detail.name} />
            <Detail label="Email" value={detail.email} />

            <div className="flex flex-col gap-[6px]">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">CV</span>
              {detail.cv_path ? (
                <>
                  <p className="text-[14px] text-foreground">
                    {detail.cv_file_name}{" "}
                    <span className="text-muted-foreground">({formatFileSize(detail.cv_size_bytes)})</span>
                  </p>
                  <div className="flex flex-wrap gap-[8px]">
                    <button
                      type="button"
                      onClick={() => void openCv(detail, "view")}
                      className="inline-flex items-center gap-[6px] rounded-[10px] border border-border px-[14px] py-[9px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5"
                    >
                      {cvLoadingId === `${detail.id}:view` ? (
                        <Loader2 className="h-[14px] w-[14px] animate-spin" />
                      ) : (
                        <FileText className="h-[14px] w-[14px]" />
                      )}
                      Open in browser
                    </button>
                    <button
                      type="button"
                      onClick={() => void openCv(detail, "download")}
                      className="inline-flex items-center gap-[6px] rounded-[10px] border border-border px-[14px] py-[9px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5"
                    >
                      {cvLoadingId === `${detail.id}:download` ? (
                        <Loader2 className="h-[14px] w-[14px] animate-spin" />
                      ) : (
                        <Download className="h-[14px] w-[14px]" />
                      )}
                      Download
                    </button>
                  </div>
                  {/* The one operational fact that isn't obvious from the UI: this
                      file won't be here forever. Sits next to the download button
                      because that's where it's actionable, rather than in a
                      page-level blurb nobody reads twice. */}
                  <p className="text-[11px] leading-[1.6] text-muted-foreground">
                    Deleted {CV_RETENTION_DAYS} days after the event — download it to keep it longer.
                  </p>
                </>
              ) : (
                <p className="inline-flex items-start gap-[6px] text-[13px] leading-[1.6] text-muted-foreground">
                  <ShieldAlert className="mt-[2px] h-[13px] w-[13px] shrink-0" />
                  {detail.cv_file_name} was deleted after the {CV_RETENTION_DAYS}-day retention period.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-[6px]">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Status</span>
              <select
                value={detail.status}
                onChange={(e) => void updateStatus(detail, e.target.value as ApplicationStatus)}
                className="self-start rounded-[10px] border border-input bg-input px-[12px] py-[9px] text-[13px]! text-foreground outline-hidden"
              >
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              {/* TODO(decision-emails): changing this tells the applicant nothing.
                  Accept / waitlist / reject emails are out of scope for this task. */}
              <p className="text-[11px] leading-[1.6] text-muted-foreground">
                Changing this doesn't email the applicant — decision emails aren't built yet.
              </p>
            </div>

            <div className="flex flex-col gap-[12px]">
              <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Answers</span>
              {orderedAnswers(detail).map((answer) => {
                const deleted = !answer.question_id || !questions.some((q) => q.id === answer.question_id);
                return (
                  <div key={answer.id} className="border-t border-border pt-[10px] first:border-t-0 first:pt-0">
                    <p className="text-[12px] font-medium text-muted-foreground">
                      {answer.question_prompt}
                      {deleted && <span className="ml-[6px] text-[10px] uppercase tracking-[0.1em]">(question removed)</span>}
                    </p>
                    <p className="mt-[4px] whitespace-pre-wrap text-[14px] leading-[1.6] text-foreground">
                      {answer.answer_text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <p className="text-[14px] text-foreground">{value}</p>
    </div>
  );
}
