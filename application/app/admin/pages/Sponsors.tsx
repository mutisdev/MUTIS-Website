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

type Sponsor = Database["public"]["Tables"]["sponsors"]["Row"];

// Sponsors are either current or past; the public Sponsors page shows the
// two as separate sections, and each has its own display order.
type Group = "current" | "past";
const GROUPS: { key: Group; label: string }[] = [
  { key: "current", label: "Current" },
  { key: "past", label: "Past" },
];
const groupOf = (r: Pick<Sponsor, "is_past">): Group => (r.is_past ? "past" : "current");

type FormState = {
  name: string;
  group: Group;
  sector: string;
  logo_url: string;
  link_url: string;
  years_active: string;
  is_published: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  group: "current",
  sector: "",
  logo_url: "",
  link_url: "",
  years_active: "",
  is_published: true,
};

export function Sponsors() {
  const toast = useToast();
  const { insertRow, updateRow, deleteRow } = useAdminMutation();

  const [rows, setRows] = usePageCache<Sponsor[]>("admin:sponsors:rows", []);
  const [loading, setLoading] = useState(!hasCached("admin:sponsors:rows"));
  const [groupFilter, setGroupFilter] = usePageCache<"all" | Group>("admin:sponsors:groupFilter", "all");
  const [publishedFilter, setPublishedFilter] = usePageCache<"all" | "published" | "unpublished">("admin:sponsors:publishedFilter", "all");
  const [search, setSearch] = usePageCache("admin:sponsors:search", "");

  const { editing, setEditing, form, setForm, pendingDelete, setPendingDelete, closeDrawer, discardConfirmProps } =
    useDrawerFormCache<Sponsor, FormState>("sponsors", EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchRows = async () => {
    const { data, error } = await supabase.from("sponsors").select("*");
    if (error) toast.error("Could not load sponsors.");
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (groupFilter !== "all" && groupOf(r) !== groupFilter) return false;
      if (publishedFilter === "published" && !r.is_published) return false;
      if (publishedFilter === "unpublished" && r.is_published) return false;
      if (search.trim() && !r.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, groupFilter, publishedFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map<Group, Sponsor[]>();
    for (const { key } of GROUPS) {
      map.set(
        key,
        filtered.filter((r) => groupOf(r) === key).sort((a, b) => a.display_order - b.display_order)
      );
    }
    return map;
  }, [filtered]);

  const nextOrderIn = (group: Group) => {
    const groupRows = rows.filter((r) => groupOf(r) === group);
    return groupRows.length ? Math.max(...groupRows.map((r) => r.display_order)) + 1 : 0;
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing("new");
  };

  const openEdit = (row: Sponsor) => {
    setForm({
      name: row.name,
      group: groupOf(row),
      sector: row.sector ?? "",
      logo_url: row.logo_url ?? "",
      link_url: row.link_url ?? "",
      years_active: row.years_active ?? "",
      is_published: row.is_published,
    });
    setEditing(row);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const values = {
        name: form.name.trim(),
        is_past: form.group === "past",
        sector: form.sector.trim() || null,
        logo_url: form.logo_url.trim() || null,
        link_url: form.link_url.trim() || null,
        years_active: form.years_active.trim() || null,
        is_published: form.is_published,
      };
      if (editing === "new") {
        await insertRow("sponsors", { ...values, display_order: nextOrderIn(form.group) });
        toast.success("Sponsor added.");
      } else if (editing) {
        // Moving between current and past puts the sponsor at the end of its new list.
        const moved = groupOf(editing) !== form.group;
        await updateRow(
          "sponsors",
          editing.id,
          moved ? { ...values, display_order: nextOrderIn(form.group) } : values,
          editing
        );
        toast.success("Sponsor updated.");
      }
      setEditing(null);
      fetchRows();
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        toast.error("A sponsor with this name already exists.");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not save that sponsor.");
      }
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteRow("sponsors", pendingDelete.id, pendingDelete);
      toast.success(`${pendingDelete.name} deleted.`);
      setPendingDelete(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete that sponsor.");
    } finally {
      setDeleting(false);
    }
  };

  const onReorder = async (group: Group, orderedIds: string[]) => {
    const groupRows = new Map(rows.filter((r) => groupOf(r) === group).map((r) => [r.id, r]));
    const updates: { id: string; display_order: number; previous: Sponsor }[] = [];
    orderedIds.forEach((id, index) => {
      const row = groupRows.get(id);
      if (row && row.display_order !== index) {
        updates.push({ id, display_order: index, previous: row });
      }
    });
    if (updates.length === 0) return;
    // Optimistic local update so the drag doesn't visually snap back while requests are in flight.
    setRows((prev) =>
      prev.map((r) => {
        const match = updates.find((u) => u.id === r.id);
        return match ? { ...r, display_order: match.display_order } : r;
      })
    );
    try {
      await Promise.all(
        updates.map((u) => updateRow("sponsors", u.id, { display_order: u.display_order }, u.previous))
      );
    } catch {
      toast.error("Could not save the new order.");
      fetchRows();
    }
  };

  const isMobile = useIsMobile();
  const isReordering = search.trim() === "" && !isMobile;

  const columns: DataTableColumn<Sponsor>[] = [
    {
      key: "logo",
      label: "",
      render: (r) => (
        <div className="flex h-[36px] w-[56px] items-center justify-center overflow-hidden rounded-[8px] border border-border bg-input">
          {r.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.logo_url} alt="" className="max-h-full max-w-full object-contain p-[4px]" />
          ) : null}
        </div>
      ),
    },
    { key: "name", label: "Name", render: (r) => r.name, sortValue: (r) => r.name },
    {
      key: "group",
      label: "Current / past",
      render: (r) => (r.is_past ? "Past" : "Current"),
      sortValue: (r) => (r.is_past ? 1 : 0),
      exportValue: (r) => (r.is_past ? "Past" : "Current"),
    },
    { key: "sector", label: "Sector", render: (r) => r.sector ?? "—", exportValue: (r) => r.sector ?? "" },
    { key: "years_active", label: "Years", render: (r) => r.years_active ?? "—", exportValue: (r) => r.years_active ?? "" },
    {
      key: "is_published",
      label: "Published",
      exportValue: (r) => (r.is_published ? "Yes" : "No"),
      render: (r) => (
        <PublishToggle
          checked={r.is_published}
          onChange={async (next) => {
            try {
              await updateRow("sponsors", r.id, { is_published: next }, r);
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
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Sponsors</h1>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-[6px] rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-[14px] w-[14px]" />
          Add sponsor
        </button>
      </div>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[220px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent"
          />
        </div>
        <select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value as "all" | Group)}
          className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden"
        >
          <option value="all">Current and past</option>
          {GROUPS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.label} only
            </option>
          ))}
        </select>
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
          <div className="flex flex-col gap-[32px]">
            {GROUPS.filter((g) => groupFilter === "all" || groupFilter === g.key).map((group) => {
              const groupRows = grouped.get(group.key) ?? [];
              return (
                <div key={group.key}>
                  <p className="mb-[8px] text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    {group.label} · {groupRows.length}
                  </p>
                  {groupRows.length === 0 ? (
                    <div className="rounded-[14px] border border-border bg-card px-[16px] py-[20px] text-center text-[13px] text-muted-foreground">
                      No {group.label.toLowerCase()} sponsors.
                    </div>
                  ) : (
                    <ReorderableList
                      items={groupRows}
                      keyField={(r) => r.id}
                      onReorder={(ids) => onReorder(group.key, ids)}
                      renderRow={(r) => (
                        <div
                          onClick={() => openEdit(r)}
                          className="grid cursor-pointer grid-cols-[56px_1fr_auto_auto_auto] items-center gap-[12px] py-[10px] pr-[10px] text-[13px]"
                        >
                          <div className="flex h-[32px] w-[48px] items-center justify-center overflow-hidden rounded-[6px] border border-border bg-input">
                            {r.logo_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={r.logo_url} alt="" className="max-h-full max-w-full object-contain p-[3px]" />
                            ) : null}
                          </div>
                          <span className="min-w-0 truncate text-foreground">{r.name}</span>
                          <span className="text-muted-foreground">{r.sector ?? "—"}</span>
                          <span onClick={(e) => e.stopPropagation()}>
                            <PublishToggle
                              checked={r.is_published}
                              onChange={async (next) => {
                                try {
                                  await updateRow("sponsors", r.id, { is_published: next }, r);
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
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} keyField={(r) => r.id} onRowClick={openEdit} emptyMessage="No sponsors match." exportFilename="sponsors.csv" />
        )}
      </div>

      <Drawer open={editing !== null} title={editing === "new" ? "Add sponsor" : "Edit sponsor"} onClose={closeDrawer}>
        <form onSubmit={onSubmit} className="flex flex-col gap-[20px]">
          <Field label="Name" required>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Current or past sponsor" required>
            <select
              value={form.group}
              onChange={(e) => setForm({ ...form, group: e.target.value as Group })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden"
            >
              {GROUPS.map((g) => (
                <option key={g.key} value={g.key}>
                  {g.label} sponsor
                </option>
              ))}
            </select>
          </Field>

          <Field label="Sector">
            <input
              type="text"
              value={form.sector}
              onChange={(e) => setForm({ ...form, sector: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Logo">
            <div className="flex flex-col gap-[12px]">
              <UrlColumnImageUploader
                bucket="sponsor_logos"
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

          <Field label="Link URL">
            <input
              type="url"
              value={form.link_url}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
              placeholder="https://…"
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </Field>

          <Field label="Years active">
            <input
              type="text"
              placeholder="2022–2023"
              value={form.years_active}
              onChange={(e) => setForm({ ...form, years_active: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
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
              {saving ? "Saving…" : editing === "new" ? "Add sponsor" : "Save changes"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete sponsor?"
        description={`${pendingDelete?.name ?? ""} will be permanently deleted. Consider unpublishing instead if this isn't a mistake or duplicate.`}
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
