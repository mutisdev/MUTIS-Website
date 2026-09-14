import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Pencil, Trash2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useAdminMutation } from "../useAdminMutation";
import { useToast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ReorderableList } from "../components/ReorderableList";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PublishToggle } from "../components/StatusBadge";
import { UrlColumnImageUploader } from "../components/ImageUploader";
import { useIsMobile } from "../components/useIsMobile";
import { usePageCache, hasCached, useDrawerFormCache } from "../usePageCache";

type NetworkLogo = Database["public"]["Tables"]["network_logos"]["Row"];
type AlumniOption = { id: string; name: string };

type FormState = {
  company_name: string;
  logo_url: string;
  alumnus_id: string;
  is_published: boolean;
};

const EMPTY_FORM: FormState = {
  company_name: "",
  logo_url: "",
  alumnus_id: "",
  is_published: true,
};

export function NetworkLogos() {
  const toast = useToast();
  const { insertRow, updateRow, deleteRow } = useAdminMutation();

  const [rows, setRows] = usePageCache<NetworkLogo[]>("admin:network-logos:rows", []);
  const [loading, setLoading] = useState(!hasCached("admin:network-logos:rows"));
  const [alumniOptions, setAlumniOptions] = usePageCache<AlumniOption[]>("admin:network-logos:alumni", []);
  const [publishedFilter, setPublishedFilter] = usePageCache<"all" | "published" | "unpublished">("admin:network-logos:publishedFilter", "all");
  const [search, setSearch] = usePageCache("admin:network-logos:search", "");

  const { editing, setEditing, form, setForm, pendingDelete, setPendingDelete, closeDrawer, discardConfirmProps } =
    useDrawerFormCache<NetworkLogo, FormState>("network-logos", EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchRows = async () => {
    const { data, error } = await supabase.from("network_logos").select("*");
    if (error) toast.error("Could not load network logos.");
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    supabase
      .from("alumni")
      .select("id,name")
      .order("name")
      .then(({ data, error }) => {
        if (error) console.error("Failed to load alumni for linking", error);
        setAlumniOptions(data ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (publishedFilter === "published" && !r.is_published) return false;
      if (publishedFilter === "unpublished" && r.is_published) return false;
      if (search.trim() && !r.company_name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, publishedFilter, search]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => a.display_order - b.display_order), [filtered]);

  const alumniName = (id: string | null) => alumniOptions.find((a) => a.id === id)?.name ?? "—";

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing("new");
  };

  const openEdit = (row: NetworkLogo) => {
    setForm({
      company_name: row.company_name,
      logo_url: row.logo_url,
      alumnus_id: row.alumnus_id ?? "",
      is_published: row.is_published,
    });
    setEditing(row);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.company_name.trim() || !form.logo_url.trim()) return;
    setSaving(true);
    try {
      const values = {
        company_name: form.company_name.trim(),
        logo_url: form.logo_url.trim(),
        alumnus_id: form.alumnus_id || null,
        is_published: form.is_published,
      };
      if (editing === "new") {
        const nextOrder = rows.length ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0;
        await insertRow("network_logos", { ...values, display_order: nextOrder });
        toast.success("Logo added.");
      } else if (editing) {
        await updateRow("network_logos", editing.id, values, editing);
        toast.success("Logo updated.");
      }
      setEditing(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that logo.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteRow("network_logos", pendingDelete.id, pendingDelete);
      toast.success(`${pendingDelete.company_name} deleted.`);
      setPendingDelete(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that logo.");
    } finally {
      setDeleting(false);
    }
  };

  const onReorder = async (orderedIds: string[]) => {
    const map = new Map(rows.map((r) => [r.id, r]));
    const updates: { id: string; display_order: number; previous: NetworkLogo }[] = [];
    orderedIds.forEach((id, index) => {
      const row = map.get(id);
      if (row && row.display_order !== index) {
        updates.push({ id, display_order: index, previous: row });
      }
    });
    if (updates.length === 0) return;
    setRows((prev) =>
      prev.map((r) => {
        const match = updates.find((u) => u.id === r.id);
        return match ? { ...r, display_order: match.display_order } : r;
      })
    );
    try {
      await Promise.all(
        updates.map((u) => updateRow("network_logos", u.id, { display_order: u.display_order }, u.previous))
      );
    } catch {
      toast.error("Could not save the new order.");
      fetchRows();
    }
  };

  const isMobile = useIsMobile();
  const isReordering = search.trim() === "" && publishedFilter === "all" && !isMobile;

  const columns: DataTableColumn<NetworkLogo>[] = [
    {
      key: "logo",
      label: "",
      render: (r) => (
        <div className="flex h-[36px] w-[56px] items-center justify-center overflow-hidden rounded-[8px] border border-border bg-input">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.logo_url} alt="" className="max-h-full max-w-full object-contain p-[4px]" />
        </div>
      ),
    },
    { key: "company_name", label: "Company", render: (r) => r.company_name, sortValue: (r) => r.company_name },
    { key: "alumnus", label: "Linked alumnus", render: (r) => alumniName(r.alumnus_id), exportValue: (r) => alumniName(r.alumnus_id) },
    {
      key: "is_published",
      label: "Published",
      exportValue: (r) => (r.is_published ? "Yes" : "No"),
      render: (r) => (
        <PublishToggle
          checked={r.is_published}
          onChange={async (next) => {
            try {
              await updateRow("network_logos", r.id, { is_published: next }, r);
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
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(r);
            }}
            className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
          >
            <Pencil className="h-[14px] w-[14px]" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPendingDelete(r);
            }}
            className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
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
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Network Logos</h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-[6px] rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-[14px] w-[14px]" />
          Add logo
        </button>
      </div>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by company…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[220px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent"
          />
        </div>
        <select
          value={publishedFilter}
          onChange={(e) => setPublishedFilter(e.target.value as typeof publishedFilter)}
          className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden"
        >
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
        ) : isReordering ? (
          sorted.length === 0 ? (
            <div className="rounded-[14px] border border-border bg-card px-[16px] py-[20px] text-center text-[13px] text-muted-foreground">
              No network logos yet.
            </div>
          ) : (
            <ReorderableList
              items={sorted}
              keyField={(r) => r.id}
              onReorder={onReorder}
              renderRow={(r) => (
                <div
                  onClick={() => openEdit(r)}
                  className="grid cursor-pointer grid-cols-[56px_1fr_auto_auto_auto] items-center gap-[12px] py-[10px] pr-[10px] text-[13px]"
                >
                  <div className="flex h-[32px] w-[48px] items-center justify-center overflow-hidden rounded-[6px] border border-border bg-input">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.logo_url} alt="" className="max-h-full max-w-full object-contain p-[3px]" />
                  </div>
                  <span className="min-w-0 truncate text-foreground">{r.company_name}</span>
                  <span className="text-muted-foreground">{alumniName(r.alumnus_id)}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <PublishToggle
                      checked={r.is_published}
                      onChange={async (next) => {
                        try {
                          await updateRow("network_logos", r.id, { is_published: next }, r);
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_published: next } : x)));
                        } catch {
                          toast.error("Could not update publish state.");
                        }
                      }}
                    />
                  </span>
                  <div className="flex items-center gap-[4px]" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => openEdit(r)}
                      className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
                    >
                      <Pencil className="h-[14px] w-[14px]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(r)}
                      className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-[14px] w-[14px]" />
                    </button>
                  </div>
                </div>
              )}
            />
          )
        ) : (
          <DataTable columns={columns} data={sorted} keyField={(r) => r.id} onRowClick={openEdit} emptyMessage="No network logos match." exportFilename="network-logos.csv" />
        )}
      </div>

      <Drawer open={editing !== null} title={editing === "new" ? "Add logo" : "Edit logo"} onClose={closeDrawer}>
        <form onSubmit={onSubmit} className="flex flex-col gap-[20px]">
          <Field label="Company name" required>
            <input
              type="text"
              required
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Logo" required>
            <div className="flex flex-col gap-[12px]">
              <UrlColumnImageUploader
                bucket="network_logos"
                currentUrl={form.logo_url}
                aspect="contain"
                onUploaded={(url) => setForm((f) => ({ ...f, logo_url: url }))}
              />
              <input
                type="text"
                placeholder="Or paste a logo URL"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
              />
            </div>
          </Field>

          <Field label="Linked alumnus (optional)">
            <select
              value={form.alumnus_id}
              onChange={(e) => setForm({ ...form, alumnus_id: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden"
            >
              <option value="">No linked alumnus</option>
              {alumniOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center justify-between rounded-[12px] border border-border px-[16px] py-[14px]">
            <span className="text-[13px] font-medium text-foreground">Published</span>
            <PublishToggle checked={form.is_published} onChange={(v) => setForm({ ...form, is_published: v })} />
          </div>

          <div className="mt-[8px] flex justify-end gap-[8px]">
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-[10px] border border-border px-[16px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : editing === "new" ? "Add logo" : "Save changes"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete logo?"
        description={`${pendingDelete?.company_name ?? ""} will be permanently deleted.`}
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
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
