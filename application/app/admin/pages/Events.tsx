import { useEffect, useMemo, useState, type FormEvent } from "react";
import DOMPurify from "dompurify";
import { Loader2, Plus, Pencil, Trash2, Search, ClipboardList } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAdminMutation } from "../useAdminMutation";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PublishToggle, StatusBadge } from "../components/StatusBadge";
import { UrlColumnImageUploader } from "../components/ImageUploader";
import { RichTextEditor } from "../components/RichTextEditor";
import { isHtmlEmpty } from "../lib/richText";
import { usePageCache, hasCached, useDrawerFormCache } from "../usePageCache";
import { QuestionBuilder } from "../components/QuestionBuilder";
import {
  draftsFromRows,
  loadEventQuestions,
  saveQuestionDrafts,
  validateQuestionDrafts,
  type QuestionDraft,
} from "../lib/eventQuestions";
import { Link } from "react-router";
import { useAuth } from "../AuthProvider";
import { MAX_VIDEO_DETAILS_CHARS, validateVideoDetails } from "@shared/eventVideo";
import { VideoDetailsPreview } from "../components/VideoDetailsPreview";
import {
  loadEventVideoDetails,
  saveEventVideoDetails,
  type EventVideoDetailsRow,
} from "../lib/eventVideoDetails";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type EventQuestionRow = Database["public"]["Tables"]["event_questions"]["Row"];

type FormState = {
  title: string;
  description: string;
  location: string;
  starts_at: string;
  ends_at: string;
  cover_image_url: string;
  capacity: string;
  tags: string;
  signup_enabled: boolean;
  is_published: boolean;
  requires_application: boolean;
  /** Staged question drafts; only written when the event is saved. */
  questions: QuestionDraft[];
  /** Video conference details. Staged like the questions, and written to
   * event_video_details — never to the event row — when the event is saved. */
  video_enabled: boolean;
  video_body: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  location: "",
  starts_at: "",
  ends_at: "",
  cover_image_url: "",
  capacity: "",
  tags: "",
  signup_enabled: false,
  is_published: true,
  requires_application: false,
  questions: [],
  video_enabled: false,
  video_body: "",
};

function parseTags(input: string): string[] {
  return Array.from(new Set(input.split(",").map((t) => t.trim()).filter(Boolean)));
}

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Events() {
  const toast = useToast();
  const { session } = useAuth();
  const { insertRow, updateRow, deleteRow } = useAdminMutation();

  const [rows, setRows] = usePageCache<EventRow[]>("admin:events:rows", []);
  const [signupCounts, setSignupCounts] = usePageCache<Map<string, number>>("admin:events:signupCounts", new Map());
  // Anonymous feedback responses per event.
  const [attendanceCounts, setAttendanceCounts] = usePageCache<Map<string, number>>("admin:events:attendanceCounts", new Map());
  // Members who said they attended (recorded separately from feedback).
  const [memberAttendanceCounts, setMemberAttendanceCounts] = usePageCache<Map<string, number>>(
    "admin:events:memberAttendanceCounts",
    new Map()
  );
  const [applicationCounts, setApplicationCounts] = usePageCache<Map<string, number>>(
    "admin:events:applicationCounts",
    new Map()
  );
  const [loading, setLoading] = useState(!hasCached("admin:events:rows"));
  const [view, setView] = usePageCache<"upcoming" | "past">("admin:events:view", "upcoming");
  const [publishedFilter, setPublishedFilter] = usePageCache<"all" | "published" | "unpublished">("admin:events:publishedFilter", "all");
  const [signupFilter, setSignupFilter] = usePageCache<"all" | "enabled" | "disabled">("admin:events:signupFilter", "all");
  const [search, setSearch] = usePageCache("admin:events:search", "");

  const { editing, setEditing, form, setForm, pendingDelete, setPendingDelete, closeDrawer, discardConfirmProps } =
    useDrawerFormCache<EventRow, FormState>("events", EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The question rows as they were when the drawer opened, so saving can diff
  // against them, write only what actually changed, and give the audit log a
  // truthful before-snapshot.
  const [savedQuestions, setSavedQuestions] = useState<EventQuestionRow[]>([]);
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [questionFormError, setQuestionFormError] = useState("");
  // The stored video block as it was when the drawer opened: the audit log's
  // before-snapshot, and the text to fall back on when the toggle is switched
  // off without the box having been touched.
  const [savedVideo, setSavedVideo] = useState<EventVideoDetailsRow | null>(null);
  const [videoError, setVideoError] = useState("");

  const fetchRows = async () => {
    const [eventsRes, statsRes, applicationsRes] = await Promise.all([
      supabase.from("events").select("*"),
      supabase.from("event_attendance_stats").select("event_id, signup_count, attendance_count, member_attendance_count"),
      // Counted here rather than added to event_attendance_stats so that view,
      // which the dashboard also reads, keeps its current shape.
      supabase.from("event_applications").select("event_id"),
    ]);
    if (applicationsRes.error) toast.error("Could not load application counts.");
    else {
      const counts = new Map<string, number>();
      for (const row of applicationsRes.data) counts.set(row.event_id, (counts.get(row.event_id) ?? 0) + 1);
      setApplicationCounts(counts);
    }
    if (eventsRes.error) toast.error("Could not load events.");
    else setRows(eventsRes.data);
    if (!statsRes.error) {
      const signups = new Map<string, number>();
      const attendance = new Map<string, number>();
      const memberAttendance = new Map<string, number>();
      for (const row of statsRes.data) {
        if (!row.event_id) continue;
        signups.set(row.event_id, row.signup_count ?? 0);
        attendance.set(row.event_id, row.attendance_count ?? 0);
        memberAttendance.set(row.event_id, row.member_attendance_count ?? 0);
      }
      setSignupCounts(signups);
      setAttendanceCounts(attendance);
      setMemberAttendanceCounts(memberAttendance);
    } else {
      toast.error("Could not load attendance stats.");
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    return rows
      .filter((r) => {
        const isUpcoming = new Date(r.starts_at).getTime() >= now;
        if (view === "upcoming" && !isUpcoming) return false;
        if (view === "past" && isUpcoming) return false;
        if (publishedFilter === "published" && !r.is_published) return false;
        if (publishedFilter === "unpublished" && r.is_published) return false;
        if (signupFilter === "enabled" && !r.signup_enabled) return false;
        if (signupFilter === "disabled" && r.signup_enabled) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          if (!r.title.toLowerCase().includes(q) && !r.location.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const diff = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
        return view === "upcoming" ? diff : -diff;
      });
  }, [rows, view, publishedFilter, signupFilter, search]);

  const resetQuestionErrors = () => {
    setQuestionErrors({});
    setQuestionFormError("");
    setVideoError("");
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSavedQuestions([]);
    setSavedVideo(null);
    resetQuestionErrors();
    setEditing("new");
  };

  // Async on purpose: useDrawerFormCache snapshots the form as its dirty-check
  // baseline the moment `editing` changes, so the questions have to be in the
  // form BEFORE the drawer opens. Loading them afterwards would make every
  // freshly-opened drawer look dirty and prompt "Discard unsaved changes?" on
  // close, even if the admin typed nothing.
  const openEdit = async (row: EventRow) => {
    let questionRows: EventQuestionRow[] = [];
    let videoRow: EventVideoDetailsRow | null = null;
    try {
      // Both loaded whether or not their toggle is currently on: a toggle hides
      // its content, it never deletes it, so an admin turning one back on must
      // find everything still here.
      [questionRows, videoRow] = await Promise.all([loadEventQuestions(row.id), loadEventVideoDetails(row.id)]);
    } catch (err) {
      console.error("Failed to load application questions or video details", err);
      // Don't open at all: an empty builder or an empty joining block would
      // wrongly suggest this event has neither, and the admin might re-add what
      // already exists — or worse, save an empty box over a working link.
      toast.error("Could not load this event's application questions or video details. Please try again.");
      return;
    }

    setSavedQuestions(questionRows);
    setSavedVideo(videoRow);
    resetQuestionErrors();
    setForm({
      title: row.title,
      description: row.description,
      location: row.location,
      starts_at: toDatetimeLocal(row.starts_at),
      ends_at: row.ends_at ? toDatetimeLocal(row.ends_at) : "",
      cover_image_url: row.cover_image_url ?? "",
      capacity: row.capacity != null ? String(row.capacity) : "",
      tags: row.tags.join(", "),
      signup_enabled: row.signup_enabled,
      is_published: row.is_published,
      requires_application: row.requires_application,
      questions: draftsFromRows(questionRows),
      video_enabled: videoRow?.is_enabled ?? false,
      video_body: videoRow?.body_text ?? "",
    });
    setEditing(row);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const sanitizedDescription = DOMPurify.sanitize(form.description);
    if (!form.title.trim() || isHtmlEmpty(sanitizedDescription) || !form.location.trim() || !form.starts_at) return;
    if (form.ends_at && new Date(form.ends_at) < new Date(form.starts_at)) {
      toast.error("End time can't be before the start time.");
      return;
    }

    // Application mode's own rules: at least one question, no empty prompts, at
    // least two options on a choice question. Only checked when the toggle is
    // on — questions kept behind a switched-off toggle needn't be valid.
    resetQuestionErrors();
    if (form.requires_application) {
      const { form: formMessage, byKey } = validateQuestionDrafts(form.questions);
      if (formMessage || Object.keys(byKey).length > 0) {
        setQuestionFormError(formMessage ?? "");
        setQuestionErrors(byKey);
        toast.error(formMessage ?? "Some questions need fixing before you can save.");
        return;
      }
    }

    // The joining block's own rules, and only while the toggle is on — text kept
    // behind a switched-off toggle needn't be valid.
    if (form.video_enabled) {
      const message = validateVideoDetails(form.video_body);
      if (message) {
        setVideoError(message);
        toast.error(message);
        return;
      }
    }

    setSaving(true);
    try {
      const values = {
        title: form.title.trim(),
        description: sanitizedDescription,
        location: form.location.trim(),
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        cover_image_url: form.cover_image_url.trim() || null,
        capacity: form.capacity.trim() ? Number(form.capacity) : null,
        tags: parseTags(form.tags),
        signup_enabled: form.signup_enabled,
        is_published: form.is_published,
        requires_application: form.requires_application,
      };
      // The event row goes through updateRow/insertRow so the audit log picks up
      // the requires_application change in its before/after snapshot for free.
      // Questions are written afterwards, against the saved event's id.
      const videoState = { enabled: form.video_enabled, bodyText: form.video_body };
      if (editing === "new") {
        const created = await insertRow("events", values);
        await saveQuestionDrafts(created.id, form.questions, savedQuestions, { insertRow, updateRow, deleteRow });
        await saveEventVideoDetails(created.id, videoState, null, session);
        toast.success("Event created.");
      } else if (editing) {
        await updateRow("events", editing.id, values, editing);
        await saveQuestionDrafts(editing.id, form.questions, savedQuestions, { insertRow, updateRow, deleteRow });
        await saveEventVideoDetails(editing.id, videoState, savedVideo, session);
        toast.success("Event updated.");
      }
      setEditing(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that event.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteRow("events", pendingDelete.id, pendingDelete);
      toast.success(`${pendingDelete.title} deleted.`);
      setPendingDelete(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that event.");
    } finally {
      setDeleting(false);
    }
  };

  const pendingSignupCount = pendingDelete ? (signupCounts.get(pendingDelete.id) ?? 0) : 0;
  const pendingAttendanceCount = pendingDelete ? (attendanceCounts.get(pendingDelete.id) ?? 0) : 0;
  const pendingMemberAttendanceCount = pendingDelete ? (memberAttendanceCounts.get(pendingDelete.id) ?? 0) : 0;
  const pendingHasRecords = pendingSignupCount > 0 || pendingAttendanceCount > 0 || pendingMemberAttendanceCount > 0;

  const columns: DataTableColumn<EventRow>[] = [
    {
      key: "cover",
      label: "",
      render: (r) => (
        <div className="flex h-[36px] w-[56px] items-center justify-center overflow-hidden rounded-[8px] border border-border bg-input">
          {r.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.cover_image_url} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
      ),
    },
    { key: "title", label: "Title", render: (r) => r.title, sortValue: (r) => r.title },
    { key: "starts_at", label: "Starts", render: (r) => formatDateTime(r.starts_at), sortValue: (r) => r.starts_at },
    { key: "location", label: "Location", render: (r) => r.location, exportValue: (r) => r.location },
    { key: "signup", label: "Signup", render: (r) => (r.signup_enabled ? <StatusBadge status="confirmed" /> : "—"), exportValue: (r) => (r.signup_enabled ? "Yes" : "No") },
    { key: "capacity", label: "Capacity", render: (r) => (r.capacity != null ? `${signupCounts.get(r.id) ?? 0} / ${r.capacity}` : `${signupCounts.get(r.id) ?? 0} / unlimited`), exportValue: (r) => (r.capacity != null ? `${signupCounts.get(r.id) ?? 0} / ${r.capacity}` : `${signupCounts.get(r.id) ?? 0} / unlimited`) },
    {
      key: "applications",
      label: "Applications",
      exportValue: (r) => (r.requires_application ? (applicationCounts.get(r.id) ?? 0) : ""),
      render: (r) =>
        r.requires_application ? (
          <Link
            to={`/admin/applications?event=${r.id}`}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-[5px] text-accent underline"
          >
            <ClipboardList className="h-[13px] w-[13px]" />
            {applicationCounts.get(r.id) ?? 0}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "member_attendance", label: "Members attended", render: (r) => `${memberAttendanceCounts.get(r.id) ?? 0}`, exportValue: (r) => memberAttendanceCounts.get(r.id) ?? 0 },
    { key: "attendance", label: "Feedback", render: (r) => `${attendanceCounts.get(r.id) ?? 0}`, exportValue: (r) => attendanceCounts.get(r.id) ?? 0 },
    {
      key: "is_published",
      label: "Published",
      exportValue: (r) => (r.is_published ? "Yes" : "No"),
      render: (r) => (
        <PublishToggle
          checked={r.is_published}
          onChange={async (next) => {
            try {
              await updateRow("events", r.id, { is_published: next }, r);
              setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_published: next } : x)));
            } catch {
              toast.error("Could not update publish state.");
            }
          }}
        />
      ),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <div className="flex items-center gap-[4px]">
          <button type="button" onClick={(e) => { e.stopPropagation(); void openEdit(r); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
            <Pencil className="h-[14px] w-[14px]" />
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDelete(r); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="h-[14px] w-[14px]" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <div className="flex flex-wrap items-start justify-between gap-[16px]">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Content</p>
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Events</h1>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-[6px] rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-[14px] w-[14px]" />
          Add event
        </button>
      </div>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="flex rounded-[10px] border border-border bg-card p-[3px]">
          {(["upcoming", "past"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-[8px] px-[14px] py-[8px] text-[12px]! font-medium capitalize transition-colors ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search title or location…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
        </div>
        <select value={publishedFilter} onChange={(e) => setPublishedFilter(e.target.value as typeof publishedFilter)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All states</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>
        <select value={signupFilter} onChange={(e) => setSignupFilter(e.target.value as typeof signupFilter)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">Signup: all</option>
          <option value="enabled">Signup enabled</option>
          <option value="disabled">Signup disabled</option>
        </select>
      </div>

      <div className="mt-[24px]">
        {loading ? (
          <div className="flex items-center justify-center py-[48px] text-muted-foreground">
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} keyField={(r) => r.id} onRowClick={(r) => void openEdit(r)} emptyMessage={`No ${view} events.`} exportFilename="events.csv" />
        )}
      </div>

      <Modal open={editing !== null} title={editing === "new" ? "Add event" : "Edit event"} onClose={closeDrawer} widthClass="max-w-[640px]">
        <form onSubmit={onSubmit} className="flex flex-col gap-[20px]">
          <Field label="Title" required>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
          </Field>

          <Field label="Description" required>
            <RichTextEditor
              key={editing === "new" ? "new" : editing?.id}
              bucket="event_photos"
              content={form.description}
              onChange={(html) => setForm((f) => ({ ...f, description: html }))}
            />
          </Field>

          <Field label="Location" required>
            <input type="text" required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
          </Field>

          <div className="grid grid-cols-2 gap-[12px]">
            <Field label="Starts" required>
              <input type="datetime-local" required value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
            </Field>
            <Field label="Ends">
              <input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
            </Field>
          </div>

          <Field label="Cover image">
            <div className="flex flex-col gap-[12px]">
              <UrlColumnImageUploader bucket="event_photos" currentUrl={form.cover_image_url} aspect="contain" maxWidth={1600} onUploaded={(url) => setForm((f) => ({ ...f, cover_image_url: url }))} />
              <input type="text" placeholder="Or paste an image URL" value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
              <p className="text-[11px] text-muted-foreground">Posters are 1080×1350 (4:5) — uploaded images are stored at their original dimensions, not cropped.</p>
            </div>
          </Field>

          <Field label="Capacity">
            <input type="number" min={1} placeholder="Leave blank for unlimited" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
          </Field>

          <Field label="Tags">
            <input type="text" placeholder="e.g. Networking, Careers, Social" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
            <p className="text-[11px] text-muted-foreground">Comma-separated. Shown as badges on the public event card.</p>
          </Field>

          <div className="flex items-center justify-between rounded-[12px] border border-border px-[16px] py-[14px]">
            <span className="text-[13px] font-medium text-foreground">
              {form.requires_application ? "Applications open" : "Signup enabled"}
            </span>
            <PublishToggle checked={form.signup_enabled} onChange={(v) => setForm({ ...form, signup_enabled: v })} />
          </div>

          {/*
            Application mode. Off by default and off for every existing event, so
            an event nobody touches behaves exactly as it always has. Turning it
            off again hides the questions but keeps every row — which is why the
            builder stays mounted below only while it's on, and why the drafts
            are still loaded either way.
          */}
          <div className="flex flex-col gap-[14px] rounded-[12px] border border-border px-[16px] py-[14px]">
            <div className="flex items-center justify-between gap-[12px]">
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-foreground">Require application</span>
                <p className="mt-[4px] text-[11px] leading-[1.6] text-muted-foreground">
                  Replaces the one-click signup with your own questions plus a CV upload. Applicants get a
                  receipt, not a confirmed place.
                </p>
              </div>
              <PublishToggle
                checked={form.requires_application}
                label={form.requires_application ? "Application required" : "Application not required"}
                onChange={(v) => setForm({ ...form, requires_application: v })}
              />
            </div>

            {form.requires_application ? (
              <QuestionBuilder
                value={form.questions}
                onChange={(questions) => setForm((f) => ({ ...f, questions }))}
                errors={questionErrors}
                formError={questionFormError}
                applicationCount={editing && editing !== "new" ? (applicationCounts.get(editing.id) ?? 0) : 0}
              />
            ) : (
              form.questions.length > 0 && (
                <p className="text-[11px] leading-[1.6] text-muted-foreground">
                  {form.questions.length} question{form.questions.length === 1 ? "" : "s"} and any applications
                  already received are kept, just hidden. Turn this back on to use them again.
                </p>
              )
            )}
          </div>
          {/*
            Video conference details. Off by default and off for every existing
            event. The text lives in event_video_details, never on the event row,
            and reaches nobody except a confirmed attendee's email — it is not on
            the public event page, not in the public events API, and not in the
            on-screen confirmation. Turning the toggle off keeps the text.
          */}
          <div className="flex flex-col gap-[14px] rounded-[12px] border border-border px-[16px] py-[14px]">
            <div className="flex items-center justify-between gap-[12px]">
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-foreground">Video conference details</span>
                <p className="mt-[4px] text-[11px] leading-[1.6] text-muted-foreground">
                  Teams, Zoom, Meet — the joining link plus any meeting ID, passcode or notes. Emailed to
                  confirmed attendees only, in the confirmation and in the reminders. Never shown on the website.
                </p>
              </div>
              <PublishToggle
                checked={form.video_enabled}
                label={form.video_enabled ? "Video details on" : "Video details off"}
                onChange={(v) => {
                  setVideoError("");
                  setForm((f) => ({ ...f, video_enabled: v }));
                }}
              />
            </div>

            {form.video_enabled ? (
              <div className="flex flex-col gap-[10px]">
                <textarea
                  rows={6}
                  value={form.video_body}
                  maxLength={MAX_VIDEO_DETAILS_CHARS}
                  onChange={(e) => {
                    setVideoError("");
                    setForm((f) => ({ ...f, video_body: e.target.value }));
                  }}
                  placeholder={"https://teams.microsoft.com/l/meetup-join/...\n\nMeeting ID: 123 456 789\nPasscode: 4821\n\nPlease join with your camera on."}
                  aria-label="Video conference details"
                  aria-invalid={videoError ? true : undefined}
                  aria-describedby="video-details-help"
                  className={`w-full resize-y rounded-[10px] border bg-input px-[14px] py-[12px] text-[14px]! leading-[1.6] text-foreground outline-hidden transition-colors focus:border-accent ${videoError ? "border-destructive" : "border-input"}`}
                />
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <p id="video-details-help" className="text-[11px] text-muted-foreground">
                    Plain text. Only links starting with <code>https://</code> become clickable; at least one is
                    required.
                  </p>
                  <p
                    className={`text-[11px] tabular-nums ${
                      form.video_body.length > MAX_VIDEO_DETAILS_CHARS - 50 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {form.video_body.length} / {MAX_VIDEO_DETAILS_CHARS}
                  </p>
                </div>
                {videoError && (
                  <p role="alert" className="text-[12px] text-destructive">
                    {videoError}
                  </p>
                )}
                <VideoDetailsPreview bodyText={form.video_body} />
              </div>
            ) : (
              form.video_body.trim().length > 0 && (
                <p className="text-[11px] leading-[1.6] text-muted-foreground">
                  The joining details are kept, just not sent to anyone. Turn this back on to use them again.
                </p>
              )
            )}
          </div>

          <div className="flex items-center justify-between rounded-[12px] border border-border px-[16px] py-[14px]">
            <span className="text-[13px] font-medium text-foreground">Published</span>
            <PublishToggle checked={form.is_published} onChange={(v) => setForm({ ...form, is_published: v })} />
          </div>

          <div className="mt-[8px] flex justify-end gap-[8px]">
            <button type="button" onClick={closeDrawer} className="rounded-[10px] border border-border px-[16px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Saving…" : editing === "new" ? "Add event" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete event?"
        description={
          pendingHasRecords
            ? `This event has ${[
                pendingSignupCount > 0 ? `${pendingSignupCount} signup${pendingSignupCount === 1 ? "" : "s"}` : null,
                pendingMemberAttendanceCount > 0
                  ? `${pendingMemberAttendanceCount} member attendance record${pendingMemberAttendanceCount === 1 ? "" : "s"}`
                  : null,
                pendingAttendanceCount > 0 ? `${pendingAttendanceCount} feedback response${pendingAttendanceCount === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(", ")} — they will be deleted too. Consider unpublishing instead.`
            : `${pendingDelete?.title ?? ""} will be permanently deleted.`
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        requireText={pendingHasRecords ? pendingDelete?.title : undefined}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog {...discardConfirmProps} />
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-[12px] font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}
