import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { ColumnPicker, type ColumnPickerGroup } from "../components/ColumnPicker";
import { DiversitySummary } from "../components/DiversitySummary";
import { usePageCache, hasCached } from "../usePageCache";

// Only the columns this page shows are read; diversity answers are not stored
// per member at all (see DiversitySummary / diversity_answer_counts).
const MEMBER_COLUMNS = "id, full_name, email, course, year, status, created_at, consent_share_partners, consent_share_partners_at";
type Member = Pick<
  Database["public"]["Tables"]["membership_signups"]["Row"],
  "id" | "full_name" | "email" | "course" | "year" | "status" | "created_at" | "consent_share_partners" | "consent_share_partners_at"
>;
type DiversityCount = Database["public"]["Tables"]["diversity_answer_counts"]["Row"];
type EventCounts = { signedUp: number; attended: number };
type MemberEvent = { eventId: string; title: string; date: string };

const STATUS_OPTIONS = ["new", "read", "archived"];

// Always shown. Everything else is behind the column picker, off by default.
const DEFAULT_COLUMNS = ["full_name", "email", "events_signed_up", "events_attended"];
const PICKER_GROUPS: ColumnPickerGroup[] = [
  {
    label: "Membership details",
    columns: [
      { key: "created_at", label: "Joined" },
      { key: "status", label: "Status" },
      { key: "course", label: "Course" },
      { key: "year", label: "Year" },
      { key: "consent_share_partners", label: "Partner sharing consent" },
      { key: "consent_share_partners_at", label: "Consent given on" },
    ],
  },
];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function Members() {
  const toast = useToast();
  const [members, setMembers] = usePageCache<Member[]>("admin:members:rows", []);
  const [countsById, setCountsById] = usePageCache<Record<string, EventCounts>>("admin:members:eventCounts", {});
  const [diversity, setDiversity] = usePageCache<DiversityCount[]>("admin:members:diversity", []);
  const [loading, setLoading] = useState(!hasCached("admin:members:rows"));

  const [search, setSearch] = usePageCache("admin:members:search", "");
  const [statusFilter, setStatusFilter] = usePageCache("admin:members:statusFilter", "all");
  const [extraColumns, setExtraColumns] = usePageCache<string[]>("admin:members:extraColumns", []);

  const [detail, setDetail] = useState<Member | null>(null);
  const [detailEvents, setDetailEvents] = useState<{ signedUp: MemberEvent[]; attended: MemberEvent[] } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = async () => {
    const [membersRes, countsRes, diversityRes] = await Promise.all([
      supabase.from("membership_signups").select(MEMBER_COLUMNS),
      supabase.from("member_event_counts").select("*"),
      supabase.from("diversity_answer_counts").select("*"),
    ]);
    if (membersRes.error || countsRes.error || diversityRes.error) toast.error("Could not load members.");
    if (membersRes.data) setMembers(membersRes.data);
    if (countsRes.data) {
      const map: Record<string, EventCounts> = {};
      for (const row of countsRes.data) {
        if (row.member_id) map[row.member_id] = { signedUp: row.events_signed_up ?? 0, attended: row.events_attended ?? 0 };
      }
      setCountsById(map);
    }
    if (diversityRes.data) setDiversity(diversityRes.data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Events are matched to members by email, so load them when a member is opened.
  useEffect(() => {
    if (!detail) {
      setDetailEvents(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      supabase
        .from("event_signups")
        .select("event_id, created_at, events(title)")
        .eq("email", detail.email)
        .eq("status", "confirmed")
        .order("created_at", { ascending: false }),
      supabase
        .from("member_event_attendance")
        .select("event_id, attended_on, events(title)")
        .eq("email", detail.email)
        .order("attended_on", { ascending: false }),
    ]).then(([signupsRes, attendedRes]) => {
      if (cancelled) return;
      if (signupsRes.error || attendedRes.error) toast.error("Could not load this member's events.");
      setDetailEvents({
        signedUp: (signupsRes.data ?? []).map((r) => ({ eventId: r.event_id, title: r.events?.title ?? "Deleted event", date: r.created_at })),
        attended: (attendedRes.data ?? []).map((r) => ({ eventId: r.event_id, title: r.events?.title ?? "Deleted event", date: r.attended_on })),
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

  const filteredMembers = useMemo(() => {
    return members
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.full_name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.course.toLowerCase().includes(q);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [members, statusFilter, search]);

  const visibleKeys = useMemo(() => new Set([...DEFAULT_COLUMNS, ...extraColumns]), [extraColumns]);
  const enabledExtras = useMemo(() => new Set(extraColumns), [extraColumns]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("membership_signups").update({ status }).eq("id", id);
    if (error) {
      toast.error("Could not update status.");
      return;
    }
    setMembers((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setDetail((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
    toast.success("Status updated.");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("membership_signups").delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Could not delete that member.");
      return;
    }
    toast.success("Deleted.");
    setPendingDelete(null);
    setDetail(null);
    fetchAll();
  };

  const signedUp = (r: Member) => countsById[r.id]?.signedUp ?? 0;
  const attended = (r: Member) => countsById[r.id]?.attended ?? 0;

  const columns: DataTableColumn<Member>[] = [
    { key: "full_name", label: "Name", render: (r) => r.full_name, sortValue: (r) => r.full_name.toLowerCase(), exportValue: (r) => r.full_name },
    { key: "email", label: "Email", render: (r) => r.email, sortValue: (r) => r.email, exportValue: (r) => r.email },
    { key: "events_signed_up", label: "Events signed up", render: (r) => signedUp(r), sortValue: signedUp },
    { key: "events_attended", label: "Events attended", render: (r) => attended(r), sortValue: attended },
    { key: "created_at", label: "Joined", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "course", label: "Course", render: (r) => r.course, exportValue: (r) => r.course },
    { key: "year", label: "Year", render: (r) => r.year, exportValue: (r) => r.year },
    {
      key: "consent_share_partners",
      label: "Partner sharing consent",
      render: (r) => (r.consent_share_partners ? "Yes" : "No"),
      exportValue: (r) => (r.consent_share_partners ? "Yes" : "No"),
    },
    {
      key: "consent_share_partners_at",
      label: "Consent given on",
      render: (r) => (r.consent_share_partners_at ? formatDate(r.consent_share_partners_at) : "—"),
      exportValue: (r) => r.consent_share_partners_at ?? "",
    },
  ];

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Membership</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Members</h1>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search name, email, course…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[240px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="mt-[24px]">
        {loading ? (
          <div className="flex items-center justify-center py-[48px] text-muted-foreground">
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={filteredMembers}
            keyField={(r) => r.id}
            onRowClick={(r) => setDetail(r)}
            emptyMessage="No members."
            exportFilename="members.csv"
            visibleKeys={visibleKeys}
            pageSize={25}
            pageResetKey={`${statusFilter}|${search}`}
            toolbar={
              <ColumnPicker
                groups={PICKER_GROUPS}
                enabled={enabledExtras}
                onChange={(next) => setExtraColumns([...next])}
              />
            }
          />
        )}
      </div>

      {!loading && (
        <div className="mt-[48px]">
          <DiversitySummary counts={diversity} />
        </div>
      )}

      <Drawer open={detail !== null} title="Member" onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex flex-col gap-[20px]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">Joined {formatDate(detail.created_at)}</span>
              <select
                value={detail.status}
                onChange={(e) => updateStatus(detail.id, e.target.value)}
                className="rounded-[8px] border border-input bg-input px-[10px] py-[6px] text-[12px]! text-foreground outline-hidden"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <DetailRow label="Full name" value={detail.full_name} />
            <DetailRow label="Email" value={detail.email} />

            <EventList label="Events signed up" events={detailEvents?.signedUp} />
            <EventList label="Events attended" events={detailEvents?.attended} />

            {extraColumns.length > 0 && (
              <>
                <div className="mt-[4px] text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Membership details
                </div>
                {enabledExtras.has("course") && <DetailRow label="Course" value={detail.course} />}
                {enabledExtras.has("year") && <DetailRow label="Year of study" value={detail.year} />}
                {enabledExtras.has("consent_share_partners") && (
                  <DetailRow label="Consented to share data with partner firms" value={detail.consent_share_partners ? "Yes" : "No"} />
                )}
                {enabledExtras.has("consent_share_partners_at") && detail.consent_share_partners_at && (
                  <DetailRow label="Consent given on" value={formatDateTime(detail.consent_share_partners_at)} />
                )}
              </>
            )}

            <div className="mt-[8px] flex justify-end gap-[8px]">
              <button
                type="button"
                onClick={() => setPendingDelete(detail)}
                className="inline-flex items-center gap-[6px] rounded-[10px] border border-destructive/40 px-[16px] py-[10px] text-[13px]! font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-[14px] w-[14px]" />
                Delete
              </button>
            </div>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete member?"
        description="This will be permanently deleted. Consider changing their status to archived instead unless this is spam or a test entry. Diversity totals are not affected."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <p className="text-[14px] text-foreground">{value}</p>
    </div>
  );
}

function EventList({ label, events }: { label: string; events: MemberEvent[] | undefined }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        {label}
        {events ? ` · ${new Set(events.map((e) => e.eventId)).size}` : ""}
      </span>
      {!events ? (
        <Loader2 className="h-[14px] w-[14px] animate-spin text-muted-foreground" />
      ) : events.length === 0 ? (
        <p className="text-[14px] text-muted-foreground">None yet.</p>
      ) : (
        <ul className="flex flex-col gap-[2px]">
          {events.map((e) => (
            <li key={`${e.eventId}-${e.date}`} className="flex justify-between gap-[12px] text-[14px] text-foreground">
              <span className="min-w-0 truncate">{e.title}</span>
              <span className="shrink-0 text-[12px] text-muted-foreground">{formatDate(e.date)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
