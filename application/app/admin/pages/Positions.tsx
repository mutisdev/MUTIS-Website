import { useEffect, useMemo, useState, type FormEvent } from "react";
import DOMPurify from "dompurify";
import { Loader2, Plus, Pencil, Trash2, Search, ClipboardList } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAdminMutation } from "../useAdminMutation";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PublishToggle, StatusBadge } from "../components/StatusBadge";
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

type PositionRow = Database["public"]["Tables"]["positions"]["Row"];
type QuestionRow = Database["public"]["Tables"]["event_questions"]["Row"];

type FormState = {
  title: string;
  description: string;
  category: string;
  /** datetime-local, or "" for a listing with no deadline. */
  closes_at: string;
  applications_open: boolean;
  is_published: boolean;
  display_order: string;
  /** Staged question drafts; only written when the position is saved. */
  questions: QuestionDraft[];
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  category: "",
  closes_at: "",
  applications_open: true,
  is_published: false,
  display_order: "0",
  questions: [],
};

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** The same predicate the RLS policy, submit_application and the public page
 * use. Written here once so this page can't disagree with them. */
function applicationsOpen(row: PositionRow, now = Date.now()): boolean {
  if (!row.is_published || !row.applications_open) return false;
  return !row.closes_at || new Date(row.closes_at).getTime() > now;
}

/**
 * Position and scheme listings for the public Opportunities page.
 *
 * Deliberately the Events page's pattern, minus everything a position hasn't
 * got: no start or end time, no venue, no capacity, no cover image, no calendar
 * invite and no reminders. What it keeps is the application side — the question
 * builder, and the link through to the shared inbox at /admin/applications.
 */
export function Positions() {
  const toast = useToast();
  const { insertRow, updateRow, deleteRow } = useAdminMutation();

  const [rows, setRows] = usePageCache<PositionRow[]>("admin:positions:rows", []);
  const [applicationCounts, setApplicationCounts] = usePageCache<Map<string, number>>(
    "admin:positions:applicationCounts",
    new Map()
  );
  const [loading, setLoading] = useState(!hasCached("admin:positions:rows"));
  const [view, setView] = usePageCache<"open" | "closed">("admin:positions:view", "open");
  const [publishedFilter, setPublishedFilter] = usePageCache<"all" | "published" | "unpublished">(
    "admin:positions:publishedFilter",
    "all"
  );
  const [search, setSearch] = usePageCache("admin:positions:search", "");

  const { editing, setEditing, form, setForm, pendingDelete, setPendingDelete, closeDrawer, discardConfirmProps } =
    useDrawerFormCache<PositionRow, FormState>("positions", EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // The question rows as they were when the drawer opened, so saving can diff
  // against them, write only what actually changed, and give the audit log a
  // truthful before-snapshot.
  const [savedQuestions, setSavedQuestions] = useState<QuestionRow[]>([]);
  const [questionErrors, setQuestionErrors] = useState<Record<string, string>>({});
  const [questionFormError, setQuestionFormError] = useState("");

  const fetchRows = async () => {
    const [positionsRes, applicationsRes] = await Promise.all([
      supabase.from("positions").select("*"),
      // event_applications holds both kinds; only the position ones are counted
      // here. See 20261023114848_applications_target_positions.sql.
      supabase.from("event_applications").select("position_id").not("position_id", "is", null),
    ]);
    if (applicationsRes.error) toast.error("Could not load application counts.");
    else {
      const counts = new Map<string, number>();
      for (const row of applicationsRes.data) {
        if (!row.position_id) continue;
        counts.set(row.position_id, (counts.get(row.position_id) ?? 0) + 1);
      }
      setApplicationCounts(counts);
    }
    if (positionsRes.error) toast.error("Could not load positions.");
    else setRows(positionsRes.data);
    setLoading(false);
  };

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const now = Date.now();
    const term = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        // "Open" and "closed" are about the round, not the publish state, so a
        // closed listing stays findable after its deadline passes.
        const isOpen = !r.closes_at || new Date(r.closes_at).getTime() > now;
        if (view === "open" && !isOpen) return false;
        if (view === "closed" && isOpen) return false;
        if (publishedFilter === "published" && !r.is_published) return false;
        if (publishedFilter === "unpublished" && r.is_published) return false;
        if (term && !r.title.toLowerCase().includes(term) && !r.category.toLowerCase().includes(term)) return false;
        return true;
      })
      .sort((a, b) => a.display_order - b.display_order || a.created_at.localeCompare(b.created_at));
  }, [rows, view, publishedFilter, search]);

  const resetQuestionErrors = () => {
    setQuestionErrors({});
    setQuestionFormError("");
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setSavedQuestions([]);
    resetQuestionErrors();
    setEditing("new");
  };

  // Async for the same reason the Events drawer is: useDrawerFormCache
  // snapshots the form as its dirty-check baseline the moment `editing`
  // changes, so the questions have to be in the form BEFORE the drawer opens.
  // Loading them afterwards would make every freshly-opened drawer look dirty.
  const openEdit = async (row: PositionRow) => {
    let questionRows: QuestionRow[] = [];
    try {
      // Loaded whether or not applications are currently open: closing a round
      // hides its questions, it never deletes them.
      questionRows = await loadEventQuestions({ kind: "position", id: row.id });
    } catch (err) {
      console.error("Failed to load application questions", err);
      // Don't open at all: an empty builder would wrongly suggest this listing
      // has no questions, and the admin might re-add what already exists.
      toast.error("Could not load this listing's application questions. Please try again.");
      return;
    }

    setSavedQuestions(questionRows);
    resetQuestionErrors();
    setForm({
      title: row.title,
      description: row.description,
      category: row.category,
      closes_at: row.closes_at ? toDatetimeLocal(row.closes_at) : "",
      applications_open: row.applications_open,
      is_published: row.is_published,
      display_order: String(row.display_order),
      questions: draftsFromRows(questionRows),
    });
    setEditing(row);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const sanitizedDescription = DOMPurify.sanitize(form.description);
    if (!form.title.trim() || !form.category.trim() || isHtmlEmpty(sanitizedDescription)) return;

    // A position has no "require application" toggle — applications are its
    // only mode — so the questions are validated whenever applications are
    // open. A listing published with no questions would render an empty form,
    // and submit_application treats a question-less target as closed, so this
    // is the guard that stops those two disagreeing.
    resetQuestionErrors();
    if (form.applications_open) {
      const { form: formMessage, byKey } = validateQuestionDrafts(form.questions, "position");
      if (formMessage || Object.keys(byKey).length > 0) {
        setQuestionFormError(formMessage ?? "");
        setQuestionErrors(byKey);
        toast.error(formMessage ?? "Some questions need fixing before you can save.");
        return;
      }
    }

    setSaving(true);
    try {
      const values = {
        title: form.title.trim(),
        description: sanitizedDescription,
        category: form.category.trim(),
        closes_at: form.closes_at ? new Date(form.closes_at).toISOString() : null,
        applications_open: form.applications_open,
        is_published: form.is_published,
        display_order: Number(form.display_order) || 0,
      };
      // Through insertRow/updateRow so the audit log picks up the before/after
      // snapshot for free. Questions are written afterwards, against the saved
      // listing's id.
      if (editing === "new") {
        const created = await insertRow("positions", values);
        await saveQuestionDrafts({ kind: "position", id: created.id }, form.questions, savedQuestions, {
          insertRow,
          updateRow,
          deleteRow,
        });
        toast.success("Listing created.");
      } else if (editing) {
        await updateRow("positions", editing.id, values, editing);
        await saveQuestionDrafts({ kind: "position", id: editing.id }, form.questions, savedQuestions, {
          insertRow,
          updateRow,
          deleteRow,
        });
        toast.success("Listing updated.");
      }
      setEditing(null);
      void fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that listing.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteRow("positions", pendingDelete.id, pendingDelete);
      toast.success(`${pendingDelete.title} deleted.`);
      setPendingDelete(null);
      void fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that listing.");
    } finally {
      setDeleting(false);
    }
  };

  const pendingApplicationCount = pendingDelete ? (applicationCounts.get(pendingDelete.id) ?? 0) : 0;

  const columns: DataTableColumn<PositionRow>[] = [
    { key: "title", label: "Title", render: (r) => r.title, sortValue: (r) => r.title },
    { key: "category", label: "Category", render: (r) => r.category, sortValue: (r) => r.category, exportValue: (r) => r.category },
    {
      key: "closes_at",
      label: "Closes",
      render: (r) => (r.closes_at ? formatDateTime(r.closes_at) : "No deadline"),
      // Nulls sort last, so dated rounds lead and open-ended ones trail.
      sortValue: (r) => r.closes_at ?? "9999",
      exportValue: (r) => (r.closes_at ? formatDateTime(r.closes_at) : "No deadline"),
    },
    {
      key: "applications_open",
      label: "Applications",
      render: (r) => (applicationsOpen(r) ? <StatusBadge status="confirmed" /> : "—"),
      exportValue: (r) => (applicationsOpen(r) ? "Open" : "Closed"),
    },
    {
      key: "applications",
      label: "Received",
      exportValue: (r) => applicationCounts.get(r.id) ?? 0,
      render: (r) => (
        <Link
          to={`/admin/applications?position=${r.id}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-[5px] text-accent underline"
        >
          <ClipboardList className="h-[13px] w-[13px]" />
          {applicationCounts.get(r.id) ?? 0}
        </Link>
      ),
    },
    { key: "display_order", label: "Order", render: (r) => String(r.display_order), sortValue: (r) => r.display_order },
    {
      key: "is_published",
      label: "Published",
      exportValue: (r) => (r.is_published ? "Yes" : "No"),
      render: (r) => (
        <PublishToggle
          checked={r.is_published}
          onChange={async (next) => {
            try {
              await updateRow("positions", r.id, { is_published: next }, r);
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
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Opportunities</h1>
          <p className="mt-[6px] text-[12px] text-muted-foreground">
            Positions and schemes, shown on the public Opportunities page. Applications land in the same inbox
            as event applications.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-[6px] rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-[14px] w-[14px]" />
          Add listing
        </button>
      </div>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="flex rounded-[10px] border border-border bg-card p-[3px]">
          {(["open", "closed"] as const).map((v) => (
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
          <input type="text" placeholder="Search title or category…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
        </div>
        <select value={publishedFilter} onChange={(e) => setPublishedFilter(e.target.value as typeof publishedFilter)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All states</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>
      </div>

      <div className="mt-[24px]">
        {loading ? (
          <div className="flex items-center justify-center py-[48px] text-muted-foreground">
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} keyField={(r) => r.id} onRowClick={(r) => void openEdit(r)} emptyMessage={`No ${view} listings.`} exportFilename="positions.csv" />
        )}
      </div>

      <Modal open={editing !== null} title={editing === "new" ? "Add listing" : "Edit listing"} onClose={closeDrawer} widthClass="max-w-[640px]">
        <form onSubmit={onSubmit} className="flex flex-col gap-[20px]">
          <Field label="Title" required>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
          </Field>

          <Field label="Category" required>
            <input type="text" required placeholder="e.g. Committee, Fund Management Scheme" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
            <p className="text-[11px] text-muted-foreground">
              Groups the public listing into sections. Reuse the same wording across listings that belong together.
            </p>
          </Field>

          <Field label="Description" required>
            <RichTextEditor
              key={editing === "new" ? "new" : editing?.id}
              bucket="event_photos"
              content={form.description}
              onChange={(html) => setForm((f) => ({ ...f, description: html }))}
            />
          </Field>

          <div className="grid grid-cols-2 gap-[12px]">
            <Field label="Applications close">
              <input type="datetime-local" value={form.closes_at} onChange={(e) => setForm({ ...form, closes_at: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
              <p className="text-[11px] text-muted-foreground">Optional. Leave blank to stay open until you close it.</p>
            </Field>
            <Field label="Order">
              <input type="number" value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
              <p className="text-[11px] text-muted-foreground">Lower numbers appear first.</p>
            </Field>
          </div>

          {/*
            Applications are a position's only mode, so there is no "require
            application" toggle to match the Events drawer's — this switch is the
            counterpart of events.signup_enabled instead. Turning it off stops
            new applications while leaving the listing and every question and
            application already received exactly where they are.
          */}
          <div className="flex flex-col gap-[14px] rounded-[12px] border border-border px-[16px] py-[14px]">
            <div className="flex items-center justify-between gap-[12px]">
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-foreground">Accepting applications</span>
                <p className="mt-[4px] text-[11px] leading-[1.6] text-muted-foreground">
                  Applicants answer your questions and attach a CV. They get a receipt, not an offer. Turn this
                  off to keep the listing up while the form is closed.
                </p>
              </div>
              <PublishToggle
                checked={form.applications_open}
                label={form.applications_open ? "Applications open" : "Applications closed"}
                onChange={(v) => setForm({ ...form, applications_open: v })}
              />
            </div>

            {form.applications_open ? (
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

          <div className="flex items-center justify-between rounded-[12px] border border-border px-[16px] py-[14px]">
            <div className="min-w-0">
              <span className="text-[13px] font-medium text-foreground">Published</span>
              <p className="mt-[4px] text-[11px] leading-[1.6] text-muted-foreground">
                A listing has no separate preview, so publishing puts it straight on the Opportunities page.
              </p>
            </div>
            <PublishToggle checked={form.is_published} onChange={(v) => setForm({ ...form, is_published: v })} />
          </div>

          <div className="mt-[8px] flex justify-end gap-[8px]">
            <button type="button" onClick={closeDrawer} className="rounded-[10px] border border-border px-[16px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Saving…" : editing === "new" ? "Add listing" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this listing?"
        // Deleting cascades to the listing's questions and to every application
        // and answer against it, so when any have been received the title has to
        // be typed out first — the same guard the Events page uses.
        description={
          pendingApplicationCount > 0
            ? `${pendingDelete?.title ?? ""} has ${pendingApplicationCount} application${pendingApplicationCount === 1 ? "" : "s"} — they will be deleted too, along with their answers. Consider closing applications or unpublishing instead.`
            : `${pendingDelete?.title ?? ""} will be permanently deleted.`
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        requireText={pendingApplicationCount > 0 ? pendingDelete?.title : undefined}
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
