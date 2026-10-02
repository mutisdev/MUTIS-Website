import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { usePageCache, hasCached } from "../usePageCache";

type LogRow = Database["public"]["Tables"]["audit_log"]["Row"];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function AuditLog() {
  const toast = useToast();
  const [rows, setRows] = usePageCache<LogRow[]>("admin:auditLog:rows", []);
  const [loading, setLoading] = useState(!hasCached("admin:auditLog:rows"));
  const [tableFilter, setTableFilter] = usePageCache("admin:auditLog:tableFilter", "all");
  // 'view' covers reads worth recording — currently an admin opening an
  // applicant's CV (see the event_applications migration).
  const [actionFilter, setActionFilter] = usePageCache<"all" | "insert" | "update" | "delete" | "view">("admin:auditLog:actionFilter", "all");
  const [search, setSearch] = usePageCache("admin:auditLog:search", "");
  const [detail, setDetail] = useState<LogRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) toast.error("Could not load the audit log.");
        else setRows(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const distinctTables = useMemo(() => Array.from(new Set(rows.map((r) => r.table_name))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (tableFilter !== "all" && r.table_name !== tableFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (search.trim() && !r.actor_email.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [rows, tableFilter, actionFilter, search]);

  const columns: DataTableColumn<LogRow>[] = [
    { key: "created_at", label: "When", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "actor_email", label: "Actor", render: (r) => r.actor_email },
    { key: "action", label: "Action", render: (r) => <StatusBadge status={r.action} /> },
    { key: "table_name", label: "Table", render: (r) => r.table_name },
    { key: "row_id", label: "Row", render: (r) => <span className="font-mono text-[11px] text-muted-foreground">{r.row_id.slice(0, 8)}…</span> },
  ];

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Settings</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Audit log</h1>
      <p className="mt-[8px] text-[13px] leading-[1.6] text-muted-foreground">
        Every admin create, update, and delete across content tables and admin access, most recent first. This log is immutable — entries can't be edited or removed.
      </p>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search by actor email…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[240px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
        </div>
        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All tables</option>
          {distinctTables.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All actions</option>
          <option value="insert">Insert</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="view">View</option>
        </select>
      </div>

      <div className="mt-[24px]">
        {loading ? (
          <div className="flex items-center justify-center py-[48px] text-muted-foreground">
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          </div>
        ) : (
          <DataTable columns={columns} data={filtered} keyField={(r) => r.id} onRowClick={setDetail} emptyMessage="No matching log entries." />
        )}
      </div>

      <Drawer open={detail !== null} title="Log entry" onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex flex-col gap-[20px]">
            <DetailRow label="When" value={formatDateTime(detail.created_at)} />
            <DetailRow label="Actor" value={detail.actor_email} />
            <DetailRow label="Action" value={detail.action} />
            <DetailRow label="Table" value={detail.table_name} />
            <DetailRow label="Row ID" value={detail.row_id} mono />
            {detail.before != null && (
              <div className="flex flex-col gap-[6px]">
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Before</span>
                <pre className="overflow-x-auto rounded-[10px] border border-border bg-card p-[14px] text-[11px] leading-[1.6] text-foreground">
                  {JSON.stringify(detail.before, null, 2)}
                </pre>
              </div>
            )}
            {detail.after != null && (
              <div className="flex flex-col gap-[6px]">
                <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">After</span>
                <pre className="overflow-x-auto rounded-[10px] border border-border bg-card p-[14px] text-[11px] leading-[1.6] text-foreground">
                  {JSON.stringify(detail.after, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <p className={`text-[14px] text-foreground ${mono ? "font-mono text-[12px]" : ""}`}>{value}</p>
    </div>
  );
}
