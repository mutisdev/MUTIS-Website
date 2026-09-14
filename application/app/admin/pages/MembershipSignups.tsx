import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { Drawer } from "../components/Drawer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { usePageCache, hasCached } from "../usePageCache";
import {
  ALL_ETHNICITY_OPTIONS,
  CONTEXTUAL_OFFER_OPTIONS,
  SCHOOL_TYPE_OPTIONS,
  FIRST_GENERATION_OPTIONS,
  FREE_SCHOOL_MEALS_OPTIONS,
  diversityLabel,
} from "@/app/data/diversityOptions";

type Signup = Database["public"]["Tables"]["membership_signups"]["Row"];
type Diversity = Database["public"]["Tables"]["membership_signup_diversity"]["Row"];

const STATUS_OPTIONS = ["new", "read", "archived"];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function MembershipSignups() {
  const toast = useToast();
  const [signups, setSignups] = usePageCache<Signup[]>("admin:membership-signups:rows", []);
  const [diversityBySignupId, setDiversityBySignupId] = usePageCache<Record<string, Diversity>>(
    "admin:membership-signups:diversity",
    {}
  );
  const [loading, setLoading] = useState(!hasCached("admin:membership-signups:rows"));

  const [search, setSearch] = usePageCache("admin:membership-signups:search", "");
  const [statusFilter, setStatusFilter] = usePageCache("admin:membership-signups:statusFilter", "all");

  const [detail, setDetail] = useState<Signup | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Signup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = async () => {
    const [signupsRes, diversityRes] = await Promise.all([
      supabase.from("membership_signups").select("*"),
      supabase.from("membership_signup_diversity").select("*"),
    ]);
    if (signupsRes.error || diversityRes.error) toast.error("Could not load membership signups.");
    if (signupsRes.data) setSignups(signupsRes.data);
    if (diversityRes.data) {
      const map: Record<string, Diversity> = {};
      for (const row of diversityRes.data) map[row.signup_id] = row;
      setDiversityBySignupId(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSignups = useMemo(() => {
    return signups
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          r.full_name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.course.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [signups, statusFilter, search]);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("membership_signups").update({ status }).eq("id", id);
    if (error) {
      toast.error("Could not update status.");
      return;
    }
    setSignups((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setDetail((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
    toast.success("Status updated.");
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("membership_signups").delete().eq("id", pendingDelete.id);
    setDeleting(false);
    if (error) {
      toast.error("Could not delete that signup.");
      return;
    }
    toast.success("Deleted.");
    setPendingDelete(null);
    setDetail(null);
    fetchAll();
  };

  const columns: DataTableColumn<Signup>[] = [
    { key: "created_at", label: "Signed up", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "full_name", label: "Name", render: (r) => r.full_name, exportValue: (r) => r.full_name },
    { key: "email", label: "Email", render: (r) => r.email, exportValue: (r) => r.email },
    { key: "course", label: "Course", render: (r) => r.course, exportValue: (r) => r.course },
    { key: "year", label: "Year", render: (r) => r.year, exportValue: (r) => r.year },
    {
      key: "consent_share_partners",
      label: "Partner sharing consent",
      render: (r) => (r.consent_share_partners ? "Yes" : "No"),
      exportValue: (r) => (r.consent_share_partners ? "Yes" : "No"),
    },
    {
      key: "ethnicity",
      label: "Ethnicity",
      render: (r) => diversityLabel(diversityBySignupId[r.id]?.ethnicity, ALL_ETHNICITY_OPTIONS),
      exportValue: (r) => diversityLabel(diversityBySignupId[r.id]?.ethnicity, ALL_ETHNICITY_OPTIONS),
    },
    {
      key: "contextual_offer",
      label: "Contextual offer",
      render: (r) => diversityLabel(diversityBySignupId[r.id]?.contextual_offer_eligible, CONTEXTUAL_OFFER_OPTIONS),
      exportValue: (r) => diversityLabel(diversityBySignupId[r.id]?.contextual_offer_eligible, CONTEXTUAL_OFFER_OPTIONS),
    },
    {
      key: "school_type",
      label: "School type",
      render: (r) => diversityLabel(diversityBySignupId[r.id]?.school_type, SCHOOL_TYPE_OPTIONS),
      exportValue: (r) => diversityLabel(diversityBySignupId[r.id]?.school_type, SCHOOL_TYPE_OPTIONS),
    },
    {
      key: "first_generation",
      label: "First-gen student",
      render: (r) => diversityLabel(diversityBySignupId[r.id]?.first_generation_student, FIRST_GENERATION_OPTIONS),
      exportValue: (r) => diversityLabel(diversityBySignupId[r.id]?.first_generation_student, FIRST_GENERATION_OPTIONS),
    },
    {
      key: "free_school_meals",
      label: "Free school meals",
      render: (r) => diversityLabel(diversityBySignupId[r.id]?.free_school_meals, FREE_SCHOOL_MEALS_OPTIONS),
      exportValue: (r) => diversityLabel(diversityBySignupId[r.id]?.free_school_meals, FREE_SCHOOL_MEALS_OPTIONS),
    },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDelete(r); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-[14px] w-[14px]" />
        </button>
      ),
    },
  ];

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Membership</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Signups</h1>

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
          <DataTable columns={columns} data={filteredSignups} keyField={(r) => r.id} onRowClick={(r) => setDetail(r)} emptyMessage="No membership signups." exportFilename="membership-signups.csv" />
        )}
      </div>

      <Drawer open={detail !== null} title="Signup" onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex flex-col gap-[20px]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-muted-foreground">{formatDateTime(detail.created_at)}</span>
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
            <DetailRow label="Course" value={detail.course} />
            <DetailRow label="Year of study" value={detail.year} />
            <DetailRow label="Consented to share data with partner firms" value={detail.consent_share_partners ? "Yes" : "No"} />

            {diversityBySignupId[detail.id] && (
              <>
                <div className="mt-[4px] text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Diversity &amp; widening participation
                </div>
                {diversityBySignupId[detail.id].ethnicity && (
                  <DetailRow
                    label="Ethnic background"
                    value={diversityLabel(diversityBySignupId[detail.id].ethnicity, ALL_ETHNICITY_OPTIONS)}
                  />
                )}
                {diversityBySignupId[detail.id].ethnicity_other_description && (
                  <DetailRow label="Ethnicity — please describe" value={diversityBySignupId[detail.id].ethnicity_other_description!} />
                )}
                {diversityBySignupId[detail.id].contextual_offer_eligible && (
                  <DetailRow
                    label="Contextual offer eligible"
                    value={diversityLabel(diversityBySignupId[detail.id].contextual_offer_eligible, CONTEXTUAL_OFFER_OPTIONS)}
                  />
                )}
                {diversityBySignupId[detail.id].school_type && (
                  <DetailRow
                    label="Type of school attended"
                    value={diversityLabel(diversityBySignupId[detail.id].school_type, SCHOOL_TYPE_OPTIONS)}
                  />
                )}
                {diversityBySignupId[detail.id].first_generation_student && (
                  <DetailRow
                    label="First-generation university student"
                    value={diversityLabel(diversityBySignupId[detail.id].first_generation_student, FIRST_GENERATION_OPTIONS)}
                  />
                )}
                {diversityBySignupId[detail.id].free_school_meals && (
                  <DetailRow
                    label="Free school meals eligible"
                    value={diversityLabel(diversityBySignupId[detail.id].free_school_meals, FREE_SCHOOL_MEALS_OPTIONS)}
                  />
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
        title="Delete signup?"
        description="This will be permanently deleted. Consider changing its status to archived instead unless this is spam or a test entry."
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
