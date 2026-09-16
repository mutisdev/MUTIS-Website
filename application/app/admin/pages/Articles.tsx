import { useEffect, useMemo, useState, type FormEvent } from "react";
import DOMPurify from "dompurify";
import { Loader2, Plus, Pencil, Trash2, Search, FileText, PenLine } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAuth } from "../AuthProvider";
import { useAdminMutation } from "../useAdminMutation";
import { useToast } from "../components/Toast";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { UrlColumnImageUploader } from "../components/ImageUploader";
import { RichTextEditor } from "../components/RichTextEditor";
import { PdfUploader } from "../components/PdfUploader";
import { isHtmlEmpty } from "../lib/richText";
import { usePageCache, hasCached, useDrawerFormCache } from "../usePageCache";

type Article = Database["public"]["Tables"]["articles"]["Row"];
type Status = "draft" | "published";
type ArticleType = "written" | "pdf";

const PDF_BUCKET = "article_pdfs";
/** Matches the article_pdfs bucket's file_size_limit. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

function pdfPublicUrl(path: string) {
  return supabase.storage.from(PDF_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** pdf_url stores the public URL; recover the object path for our own bucket (null for anything else). */
function pdfPathFromUrl(url: string | null | undefined) {
  const marker = `/storage/v1/object/public/${PDF_BUCKET}/`;
  if (!url || !url.includes(marker)) return null;
  return decodeURIComponent(url.split(marker)[1].split("?")[0]);
}

type FormState = {
  article_type: ArticleType;
  title: string;
  tag: string;
  author_name: string;
  cover_image_url: string;
  body_html: string;
  pdf_url: string;
  status: Status;
};

function emptyForm(defaultAuthor: string): FormState {
  return { article_type: "written", title: "", tag: "", author_name: defaultAuthor, cover_image_url: "", body_html: "", pdf_url: "", status: "draft" };
}

function formatDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
}

export function Articles() {
  const { session } = useAuth();
  const toast = useToast();
  const { insertRow, updateRow, deleteRow } = useAdminMutation();

  const [rows, setRows] = usePageCache<Article[]>("admin:articles:rows", []);
  const [loading, setLoading] = useState(!hasCached("admin:articles:rows"));
  const [statusFilter, setStatusFilter] = usePageCache<"all" | Status>("admin:articles:statusFilter", "all");
  const [tagFilter, setTagFilter] = usePageCache("admin:articles:tagFilter", "all");
  const [sortBy, setSortBy] = usePageCache<"updated" | "published">("admin:articles:sortBy", "updated");
  const [search, setSearch] = usePageCache("admin:articles:search", "");

  const { editing, setEditing, form, setForm, pendingDelete, setPendingDelete, closeDrawer, discardConfirmProps } =
    useDrawerFormCache<Article, FormState>("articles", emptyForm(""));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingTypeSwitch, setPendingTypeSwitch] = useState<ArticleType | null>(null);

  const fetchRows = async () => {
    const { data, error } = await supabase.from("articles").select("*");
    if (error) toast.error("Could not load articles.");
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const distinctTags = useMemo(() => Array.from(new Set(rows.map((r) => r.tag))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => {
        if (statusFilter !== "all" && r.status !== statusFilter) return false;
        if (tagFilter !== "all" && r.tag !== tagFilter) return false;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          if (!r.title.toLowerCase().includes(q) && !r.author_name.toLowerCase().includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "published") {
          return (b.published_at ?? "").localeCompare(a.published_at ?? "");
        }
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [rows, statusFilter, tagFilter, search, sortBy]);

  const defaultAuthorName = () => session?.user.user_metadata?.full_name ?? session?.user.email ?? "";

  const openCreate = () => {
    setForm(emptyForm(defaultAuthorName()));
    setEditing("new");
  };

  const openEdit = (row: Article) => {
    setForm({
      article_type: row.article_type === "pdf" ? "pdf" : "written",
      title: row.title,
      tag: row.tag,
      author_name: row.author_name,
      cover_image_url: row.cover_image_url ?? "",
      body_html: row.body_html ?? "",
      pdf_url: row.pdf_url ?? "",
      status: row.status as Status,
    });
    setEditing(row);
  };

  const hasContentFor = (type: ArticleType) => (type === "written" ? !isHtmlEmpty(form.body_html) : Boolean(form.pdf_url.trim()));

  const applyTypeSwitch = (next: ArticleType) => {
    // Clear the outgoing type's content — the DB only allows one of body_html / pdf_url per type.
    setForm((f) => ({ ...f, article_type: next, ...(next === "pdf" ? { body_html: "" } : { pdf_url: "" }) }));
    setPendingTypeSwitch(null);
  };

  const requestTypeSwitch = (next: ArticleType) => {
    if (next === form.article_type) return;
    if (hasContentFor(form.article_type)) setPendingTypeSwitch(next);
    else applyTypeSwitch(next);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.title.trim() || !form.tag.trim() || !form.author_name.trim()) return;
    const isPdf = form.article_type === "pdf";
    const sanitizedBody = !isPdf && form.body_html.trim() ? DOMPurify.sanitize(form.body_html) : "";
    if (isPdf && !form.pdf_url.trim()) {
      toast.error("Upload a PDF first.");
      return;
    }
    if (!isPdf && isHtmlEmpty(sanitizedBody)) {
      toast.error("A written article needs some body text.");
      return;
    }
    setSaving(true);
    try {
      const wasPublished = editing !== "new" && editing?.status === "published";
      const nowPublishing = form.status === "published" && !wasPublished;
      const values = {
        title: form.title.trim(),
        tag: form.tag.trim(),
        author_name: form.author_name.trim(),
        cover_image_url: form.cover_image_url.trim() || null,
        article_type: form.article_type,
        body_html: isPdf ? null : sanitizedBody,
        pdf_url: isPdf ? form.pdf_url.trim() : null,
        status: form.status,
        ...(nowPublishing ? { published_at: new Date().toISOString() } : {}),
      };
      if (editing === "new") {
        await insertRow("articles", { ...values, author_id: session?.user.id ?? null });
        toast.success("Article created.");
      } else if (editing) {
        await updateRow("articles", editing.id, values, editing);
        // The saved row no longer points at its old PDF (replaced, or switched to written) — remove the file.
        const oldPath = pdfPathFromUrl(editing.pdf_url);
        if (oldPath && oldPath !== pdfPathFromUrl(values.pdf_url)) {
          await supabase.storage.from(PDF_BUCKET).remove([oldPath]);
        }
        toast.success("Article updated.");
      }
      setEditing(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that article.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteRow("articles", pendingDelete.id, pendingDelete);
      const pdfPath = pdfPathFromUrl(pendingDelete.pdf_url);
      if (pdfPath) await supabase.storage.from(PDF_BUCKET).remove([pdfPath]);
      toast.success(`${pendingDelete.title} deleted.`);
      setPendingDelete(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that article.");
    } finally {
      setDeleting(false);
    }
  };

  const columns: DataTableColumn<Article>[] = [
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
    { key: "article_type", label: "Type", render: (r) => <ArticleTypeBadge type={r.article_type} />, exportValue: (r) => r.article_type },
    { key: "tag", label: "Tag", render: (r) => r.tag, exportValue: (r) => r.tag },
    { key: "author_name", label: "Author", render: (r) => r.author_name, exportValue: (r) => r.author_name },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "published_at", label: "Published", render: (r) => formatDate(r.published_at), exportValue: (r) => r.published_at ?? "" },
    { key: "updated_at", label: "Updated", render: (r) => formatDate(r.updated_at), sortValue: (r) => r.updated_at },
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
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Articles</h1>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-[6px] rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-[14px] w-[14px]" />
          Add article
        </button>
      </div>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search title or author…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[220px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All tags</option>
          {distinctTags.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="updated">Sort: recently updated</option>
          <option value="published">Sort: recently published</option>
        </select>
      </div>

      <div className="mt-[24px]">
        {loading ? (
          <div className="flex items-center justify-center py-[48px] text-muted-foreground">
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} keyField={(r) => r.id} onRowClick={openEdit} emptyMessage="No articles match." exportFilename="articles.csv" />
        )}
      </div>

      <Modal open={editing !== null} title={editing === "new" ? "Add article" : "Edit article"} onClose={closeDrawer} widthClass="max-w-[720px]">
        <form onSubmit={onSubmit} className="flex flex-col gap-[20px]">
          <div role="radiogroup" aria-label="Article format" className="grid grid-cols-2 gap-[4px] rounded-[12px] border border-border bg-input p-[4px]">
            {([
              { value: "written", label: "Written article", Icon: PenLine },
              { value: "pdf", label: "PDF upload", Icon: FileText },
            ] as const).map(({ value, label, Icon }) => {
              const selected = form.article_type === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => requestTypeSwitch(value)}
                  className={`inline-flex items-center justify-center gap-[8px] rounded-[9px] px-[12px] py-[10px] text-[13px]! font-medium transition-colors ${
                    selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-[14px] w-[14px]" />
                  {label}
                </button>
              );
            })}
          </div>

          <Field label="Title" required>
            <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
          </Field>

          <div className="grid grid-cols-2 gap-[12px]">
            <Field label="Tag" required>
              <input type="text" required list="article-tags" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
              <datalist id="article-tags">
                {distinctTags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Author name" required>
              <input type="text" required value={form.author_name} onChange={(e) => setForm({ ...form, author_name: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
            </Field>
          </div>

          <Field label="Cover image">
            <div className="flex flex-col gap-[12px]">
              <UrlColumnImageUploader bucket="article_covers" currentUrl={form.cover_image_url} aspect="banner" maxWidth={1600} onUploaded={(url) => setForm((f) => ({ ...f, cover_image_url: url }))} />
              <input type="text" placeholder="Or paste an image URL" value={form.cover_image_url} onChange={(e) => setForm({ ...form, cover_image_url: e.target.value })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent" />
            </div>
          </Field>

          {form.article_type === "written" ? (
            <Field label="Body" required>
              <RichTextEditor
                key={editing === "new" ? "new" : editing?.id}
                content={form.body_html}
                onChange={(html) => setForm((f) => ({ ...f, body_html: html }))}
              />
            </Field>
          ) : (
            <Field label="PDF" required>
              <PdfUploader
                key={editing === "new" ? "new" : editing?.id}
                bucket={PDF_BUCKET}
                maxBytes={MAX_PDF_BYTES}
                // Only the saved row's file counts as "original" (never deleted by the uploader);
                // after a type switch cleared pdf_url, start empty instead of re-showing it.
                currentPath={editing !== "new" && editing && form.pdf_url === editing.pdf_url ? pdfPathFromUrl(editing.pdf_url) : null}
                onChange={(result) => setForm((f) => ({ ...f, pdf_url: result ? pdfPublicUrl(result.path) : "" }))}
              />
            </Field>
          )}

          <Field label="Status" required>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Status })} className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden">
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </Field>

          <div className="mt-[8px] flex justify-end gap-[8px]">
            <button type="button" onClick={closeDrawer} className="rounded-[10px] border border-border px-[16px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
              {saving ? "Saving…" : editing === "new" ? "Add article" : "Save changes"}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete article?"
        description={`${pendingDelete?.title ?? ""} will be permanently deleted.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={pendingTypeSwitch !== null}
        title={pendingTypeSwitch === "pdf" ? "Switch to PDF upload?" : "Switch to written article?"}
        description={
          pendingTypeSwitch === "pdf"
            ? "The written body will be cleared. Nothing changes until you save."
            : "The uploaded PDF will be removed from this article. Nothing changes until you save."
        }
        confirmLabel="Switch"
        destructive
        onConfirm={() => pendingTypeSwitch && applyTypeSwitch(pendingTypeSwitch)}
        onCancel={() => setPendingTypeSwitch(null)}
      />

      <ConfirmDialog {...discardConfirmProps} />
    </div>
  );
}

function ArticleTypeBadge({ type }: { type: string }) {
  const isPdf = type === "pdf";
  const Icon = isPdf ? FileText : PenLine;
  return (
    <span className="inline-flex items-center gap-[4px] rounded-[8px] border border-border px-[8px] py-[2px] text-[10px]! font-medium uppercase tracking-[0.06em] text-muted-foreground">
      <Icon className="h-[11px] w-[11px]" />
      {isPdf ? "PDF" : "Written"}
    </span>
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
