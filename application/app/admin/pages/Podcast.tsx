import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { fetchSpotifyOEmbed, sanitizeSpotifyEmbedHtml } from "@/lib/spotifyEmbed";
import { useAdminMutation } from "../useAdminMutation";
import { useToast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ReorderableList } from "../components/ReorderableList";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { PublishToggle } from "../components/StatusBadge";
import { useIsMobile } from "../components/useIsMobile";
import { usePageCache, hasCached, useDrawerFormCache } from "../usePageCache";

type PodcastEpisode = Database["public"]["Tables"]["podcast_episodes"]["Row"];

type FormState = {
  spotify_url: string;
  is_published: boolean;
};

const EMPTY_FORM: FormState = { spotify_url: "", is_published: true };

/** The cached embed fields, as they look when we have no preview for a link. */
const NO_EMBED = {
  embed_html: null,
  embed_width: null,
  embed_height: null,
  embed_title: null,
  thumbnail_url: null,
  fetched_at: null,
};

/** Either a freshly fetched preview or the cleared-out equivalent. */
type EmbedFields = typeof NO_EMBED | Awaited<ReturnType<typeof buildEmbed>>;

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function labelOf(row: PodcastEpisode) {
  return row.embed_title ?? row.spotify_url;
}

export function Podcast() {
  const toast = useToast();
  const { insertRow, updateRow, deleteRow } = useAdminMutation();

  const [rows, setRows] = usePageCache<PodcastEpisode[]>("admin:podcast:rows", []);
  const [loading, setLoading] = useState(!hasCached("admin:podcast:rows"));
  const [publishedFilter, setPublishedFilter] = usePageCache<"all" | "published" | "unpublished">("admin:podcast:publishedFilter", "all");

  const { editing, setEditing, form, setForm, pendingDelete, setPendingDelete, closeDrawer, discardConfirmProps } =
    useDrawerFormCache<PodcastEpisode, FormState>("podcast", EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchRows = async () => {
    const { data, error } = await supabase
      .from("podcast_episodes")
      .select("*")
      // Same ordering as the public page, so this list is what visitors see.
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) toast.error("Could not load podcast episodes.");
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (publishedFilter === "published" && !r.is_published) return false;
      if (publishedFilter === "unpublished" && r.is_published) return false;
      return true;
    });
  }, [rows, publishedFilter]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing("new");
  };

  const openEdit = (row: PodcastEpisode) => {
    setForm({ spotify_url: row.spotify_url, is_published: row.is_published });
    setEditing(row);
  };

  /** Insert or update, with `embed` folded into the values. */
  const save = async (embed: EmbedFields, spotifyUrl: string) => {
    const values = { spotify_url: spotifyUrl, is_published: form.is_published, ...embed };
    if (editing === "new") {
      // New episodes land in the last slot; the admin drags them up from there.
      const nextOrder = rows.length ? Math.max(...rows.map((r) => r.display_order)) + 1 : 0;
      await insertRow("podcast_episodes", { ...values, display_order: nextOrder });
    } else if (editing) {
      await updateRow("podcast_episodes", editing.id, values, editing);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = form.spotify_url.trim();
    if (!trimmed) {
      toast.error("Enter a Spotify show or episode link.");
      return;
    }
    if (!trimmed.startsWith("https://open.spotify.com/")) {
      toast.error("That doesn't look like a Spotify link (should start with https://open.spotify.com/).");
      return;
    }

    setSaving(true);
    try {
      let embed: EmbedFields = NO_EMBED;
      let previewError: string | null = null;
      try {
        embed = await buildEmbed(trimmed);
      } catch (err) {
        // The oEmbed fetch failed — still save the link so the public site can at
        // least show a plain "Open in Spotify" fallback, per the
        // graceful-degradation requirement.
        previewError = err instanceof Error ? err.message : null;
      }
      await save(embed, trimmed);
      if (previewError === null) {
        toast.success(editing === "new" ? "Episode added." : "Episode updated.");
      } else {
        toast.error(
          `Saved the link, but couldn't fetch a preview: ${previewError} The site will show a plain link until this succeeds.`
        );
      }
      setEditing(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save that episode.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteRow("podcast_episodes", pendingDelete.id, pendingDelete);
      toast.success("Episode removed.");
      setPendingDelete(null);
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that episode.");
    } finally {
      setDeleting(false);
    }
  };

  const onReorder = async (orderedIds: string[]) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const updates: { id: string; display_order: number; previous: PodcastEpisode }[] = [];
    orderedIds.forEach((id, index) => {
      const row = byId.get(id);
      if (row && row.display_order !== index) {
        updates.push({ id, display_order: index, previous: row });
      }
    });
    if (updates.length === 0) return;
    setRows((prev) => {
      const next = prev.map((r) => {
        const match = updates.find((u) => u.id === r.id);
        return match ? { ...r, display_order: match.display_order } : r;
      });
      return next.sort((a, b) => a.display_order - b.display_order);
    });
    try {
      await Promise.all(
        updates.map((u) => updateRow("podcast_episodes", u.id, { display_order: u.display_order }, u.previous))
      );
    } catch {
      toast.error("Could not save the new order.");
      fetchRows();
    }
  };

  const togglePublished = async (r: PodcastEpisode, next: boolean) => {
    try {
      await updateRow("podcast_episodes", r.id, { is_published: next }, r);
      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, is_published: next } : x)));
    } catch {
      toast.error("Could not update publish state.");
    }
  };

  const isMobile = useIsMobile();
  // Dragging only makes sense while every episode is on screen, and the drag
  // handles don't work on touch — fall back to the table otherwise.
  const isReordering = publishedFilter === "all" && !isMobile;

  // Slot numbers count published episodes only, so they read the same here as the
  // numbers a visitor sees on the Media page. An unpublished episode holds its
  // place in the order but isn't numbered.
  const publishedIds = useMemo(() => rows.filter((r) => r.is_published).map((r) => r.id), [rows]);
  const slotOf = (r: PodcastEpisode) =>
    r.is_published ? String(publishedIds.indexOf(r.id) + 1).padStart(2, "0") : "—";

  const columns: DataTableColumn<PodcastEpisode>[] = [
    { key: "slot", label: "Slot", render: (r) => <span className="text-muted-foreground">{slotOf(r)}</span> },
    {
      key: "title",
      label: "Episode",
      render: (r) => (
        <div className="flex min-w-0 flex-col gap-[2px]">
          <span className="truncate text-foreground">{labelOf(r)}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {r.embed_html ? `Preview synced ${r.fetched_at ? formatDateTime(r.fetched_at) : "—"}` : "No preview — plain link fallback"}
          </span>
        </div>
      ),
    },
    {
      key: "is_published",
      label: "Published",
      render: (r) => <PublishToggle checked={r.is_published} onChange={(next) => togglePublished(r, next)} />,
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
          <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Podcast</h1>
          <p className="mt-[8px] max-w-[620px] text-[13px] leading-[1.6] text-muted-foreground">
            Each episode is a slot on the Media page, shown in the order below. Saving a link fetches a fresh
            embed preview via Spotify's oEmbed API and caches it — the public site never calls Spotify directly.
          </p>
        </div>
        <button type="button" onClick={openCreate} className="inline-flex items-center gap-[6px] rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90">
          <Plus className="h-[14px] w-[14px]" />
          Add episode
        </button>
      </div>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <select value={publishedFilter} onChange={(e) => setPublishedFilter(e.target.value as typeof publishedFilter)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All states</option>
          <option value="published">Published</option>
          <option value="unpublished">Unpublished</option>
        </select>
        {isReordering && rows.length > 1 && (
          <p className="text-[12px] text-muted-foreground">Drag an episode by its handle to change its slot.</p>
        )}
      </div>

      <div className="mt-[24px]">
        {loading ? (
          <div className="flex items-center justify-center py-[48px] text-muted-foreground">
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-[14px] border border-border bg-card px-[16px] py-[20px] text-center text-[13px] text-muted-foreground">
            No episodes yet.
          </div>
        ) : isReordering ? (
          <ReorderableList
            items={filtered}
            keyField={(r) => r.id}
            onReorder={onReorder}
            renderRow={(r) => (
              <div onClick={() => openEdit(r)} className="grid cursor-pointer grid-cols-[32px_1fr_auto_auto] items-center gap-[12px] py-[10px] pr-[10px] text-[13px]">
                <span className="text-muted-foreground">{slotOf(r)}</span>
                <div className="flex min-w-0 flex-col gap-[2px]">
                  <span className="truncate text-foreground">{labelOf(r)}</span>
                  {!r.embed_html && (
                    <span className="truncate text-[11px] text-muted-foreground">No preview — plain link fallback</span>
                  )}
                </div>
                <span onClick={(e) => e.stopPropagation()}>
                  <PublishToggle checked={r.is_published} onChange={(next) => togglePublished(r, next)} />
                </span>
                <div className="flex items-center gap-[4px]" onClick={(e) => e.stopPropagation()}>
                  <button type="button" onClick={() => openEdit(r)} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground">
                    <Pencil className="h-[14px] w-[14px]" />
                  </button>
                  <button type="button" onClick={() => setPendingDelete(r)} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="h-[14px] w-[14px]" />
                  </button>
                </div>
              </div>
            )}
          />
        ) : (
          <DataTable columns={columns} data={filtered} keyField={(r) => r.id} onRowClick={openEdit} emptyMessage="No episodes match." />
        )}
      </div>

      <Drawer open={editing !== null} title={editing === "new" ? "Add episode" : "Edit episode"} onClose={closeDrawer}>
        <form onSubmit={onSubmit} className="flex flex-col gap-[20px]">
          <div className="flex flex-col gap-[6px]">
            <label className="text-[12px] font-medium text-muted-foreground">
              Spotify link<span className="text-destructive"> *</span>
            </label>
            <input
              type="url"
              required
              placeholder="https://open.spotify.com/episode/…"
              value={form.spotify_url}
              onChange={(e) => setForm({ ...form, spotify_url: e.target.value })}
              className="w-full rounded-[10px] border border-input bg-input px-[14px] py-[12px] text-[15px]! text-foreground outline-hidden transition-colors focus:border-accent"
            />
          </div>

          <div className="flex items-center justify-between rounded-[12px] border border-border px-[16px] py-[14px]">
            <span className="text-[13px] font-medium text-foreground">Published</span>
            <PublishToggle checked={form.is_published} onChange={(v) => setForm({ ...form, is_published: v })} />
          </div>

          {editing !== null && editing !== "new" && (
            <div className="rounded-[14px] border border-border p-[20px]">
              <p className="text-[12px] font-medium text-muted-foreground">Cached preview</p>
              {editing.embed_html ? (
                <>
                  <div
                    className="mt-[14px] max-w-[624px]"
                    dangerouslySetInnerHTML={{ __html: sanitizeSpotifyEmbedHtml(editing.embed_html) }}
                  />
                  <p className="mt-[12px] text-[12px] text-muted-foreground">
                    {editing.embed_title && <>{editing.embed_title} · </>}
                    Last synced {editing.fetched_at ? formatDateTime(editing.fetched_at) : "—"}
                  </p>
                </>
              ) : (
                <p className="mt-[10px] text-[13px] text-muted-foreground">
                  No cached preview yet — the public site is showing a plain link fallback. Saving tries again.
                </p>
              )}
              <a
                href={editing.spotify_url}
                target="_blank"
                rel="noreferrer"
                className="mt-[14px] inline-flex items-center gap-[6px] text-[12px]! font-medium text-accent hover:underline"
              >
                Open in Spotify <ExternalLink className="h-[12px] w-[12px]" />
              </a>
            </div>
          )}

          <div className="mt-[8px] flex justify-end gap-[8px]">
            <button type="button" onClick={closeDrawer} className="rounded-[10px] border border-border px-[16px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-[6px] rounded-[10px] bg-primary px-[16px] py-[10px] text-[13px]! font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
              {saving && <Loader2 className="h-[14px] w-[14px] animate-spin" />}
              {saving ? "Fetching preview…" : editing === "new" ? "Add episode" : "Save changes"}
            </button>
          </div>
        </form>
      </Drawer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove episode?"
        description="This episode will be removed from the Media page. The episode stays on Spotify."
        confirmLabel={deleting ? "Removing…" : "Remove"}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog {...discardConfirmProps} />
    </div>
  );
}

/** Fetch and sanitize the cached embed fields for a Spotify link. */
async function buildEmbed(spotifyUrl: string) {
  const oembed = await fetchSpotifyOEmbed(spotifyUrl);
  return {
    embed_html: sanitizeSpotifyEmbedHtml(oembed.html),
    embed_width: oembed.width,
    embed_height: oembed.height,
    embed_title: oembed.title ?? null,
    thumbnail_url: oembed.thumbnail_url ?? null,
    fetched_at: new Date().toISOString(),
  };
}
