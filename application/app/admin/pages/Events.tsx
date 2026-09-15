import { useEffect, useMemo, useState, type FormEvent } from "react";
import DOMPurify from "dompurify";
import { Loader2, Plus, Pencil, Trash2, Search } from "lucide-react";
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

type EventRow = Database["public"]["Tables"]["events"]["Row"];

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
  const { insertRow, updateRow, deleteRow } = useAdminMutation();

  const [rows, setRows] = usePageCache<EventRow[]>("admin:events:rows", []);
  const [signupCounts, setSignupCounts] = usePageCache<Map<string, number>>("admin:events:signupCounts", new Map());
  const [attendanceCounts, setAttendanceCounts] = usePageCache<Map<string, number>>("admin:events:attendanceCounts", new Map());
  const [loading, setLoading] = useState(!hasCached("admin:events:rows"));
  const [view, setView] = usePageCache<"upcoming" | "past">("admin:events:view", "upcoming");
  const [publishedFilter, setPublishedFilter] = usePageCache<"all" | "published" | "unpublished">("admin:events:publishedFilter", "all");
  const [signupFilter, setSignupFilter] = usePageCache<"all" | "enabled" | "disabled">("admin:events:signupFilter", "all");
  const [search, setSearch] = usePageCache("admin:events:search", "");

  const { editing, setEditing, form, setForm, pendingDelete, setPendingDelete, closeDrawer, discardConfirmProps } =
    useDrawerFormCache<EventRow, FormState>("events", EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchRows = async () => {
    const [eventsRes, statsRes] = await Promise.all([
      supabase.from("events").select("*"),
      supabase.from("event_attendance_stats").select("event_id, signup_count, attendance_count"),
    ]);
    if (eventsRes.error) toast.error("Could not load events.");
    else setRows(eventsRes.data);
    if (!statsRes.error) {
      const signups = new Map<string, number>();
      const attendance = new Map<string, number>();
      for (const row of statsRes.data) {
        if (!row.event_id) continue;
        signups.set(row.event_id, row.signup_count ?? 0);
        attendance.set(row.event_id, row.attendance_count ?? 0);
      }
      setSignupCounts(signups);
      setAttendanceCounts(attendance);
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

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing("new");
  };

  const openEdit = (row: EventRow) => {
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
      };
      if (editing === "new") {
        await insertRow("events", values);
        toast.success("Event created.");
      } else if (editing) {
        await updateRow("events", editing.id, values, editing);
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
    { key: "attendance", label: "Attendance", render: (r) => `${attendanceCounts.get(r.id) ?? 0}`, exportValue: (r) => attendanceCounts.get(r.id) ?? 0 },
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
          <button type="button" onClick={(e) => { e.stopPropagation(); openEdit(r); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
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
          <DataTable columns={columns} data={filtered} keyField={(r) => r.id} onRowClick={openEdit} emptyMessage={`No ${view} events.`} exportFilename="events.csv" />
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
              <UrlColumnImageUploader bucket="event_photos" currentUrl={form.cover_image_url} aspect="banner" maxWidth={1600} onUploaded={(url) => setForm((f) => ({ ...f, cover_image_url: url }))} />
              <input type="text" placeholder="Or paste an image URL" value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
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
            <span className="text-[13px] font-medium text-foreground">Signup enabled</span>
            <PublishToggle checked={form.signup_enabled} onChange={(v) => setForm({ ...form, signup_enabled: v })} />
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
          pendingSignupCount > 0 || pendingAttendanceCount > 0
            ? `This event has ${[
                pendingSignupCount > 0 ? `${pendingSignupCount} signup${pendingSignupCount === 1 ? "" : "s"}` : null,
                pendingAttendanceCount > 0 ? `${pendingAttendanceCount} attendance record${pendingAttendanceCount === 1 ? "" : "s"}` : null,
              ]
                .filter(Boolean)
                .join(" and ")} — they will be deleted too. Consider unpublishing instead.`
            : `${pendingDelete?.title ?? ""} will be permanently deleted.`
        }
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        requireText={pendingSignupCount > 0 || pendingAttendanceCount > 0 ? pendingDelete?.title : undefined}
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
