import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Search, Inbox as InboxIcon, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { useAuth } from "../AuthProvider";
import { useAdminMutation } from "../useAdminMutation";
import { Drawer } from "../components/Drawer";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { usePageCache, hasCached } from "../usePageCache";

type Contact = Database["public"]["Tables"]["contact_submissions"]["Row"];
type Sponsorship = Database["public"]["Tables"]["sponsorship_enquiries"]["Row"];
type Signup = Database["public"]["Tables"]["event_signups"]["Row"];
type EventRow = Database["public"]["Tables"]["events"]["Row"];
type Attendance = Database["public"]["Tables"]["attendance_submissions"]["Row"];
type AlumniSubmission = Database["public"]["Tables"]["alumni_submissions"]["Row"];

type Tab = "contact" | "sponsorship" | "signups" | "attendance" | "alumni";

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "contact", label: "Contact" },
  { key: "sponsorship", label: "Sponsorship" },
  { key: "signups", label: "Event signups" },
  { key: "attendance", label: "Attendance" },
  { key: "alumni", label: "Alumni" },
];

export function Submissions() {
  const toast = useToast();
  const { session } = useAuth();
  const { insertRow } = useAdminMutation();
  const [tab, setTab] = usePageCache<Tab>("admin:submissions:tab", "contact");

  const [contacts, setContacts] = usePageCache<Contact[]>("admin:submissions:contacts", []);
  const [sponsorships, setSponsorships] = usePageCache<Sponsorship[]>("admin:submissions:sponsorships", []);
  const [signups, setSignups] = usePageCache<Signup[]>("admin:submissions:signups", []);
  const [attendances, setAttendances] = usePageCache<Attendance[]>("admin:submissions:attendances", []);
  const [alumniSubs, setAlumniSubs] = usePageCache<AlumniSubmission[]>("admin:submissions:alumni", []);
  const [events, setEvents] = usePageCache<EventRow[]>("admin:submissions:events", []);
  const [loading, setLoading] = useState(!hasCached("admin:submissions:contacts"));

  const [search, setSearch] = usePageCache("admin:submissions:search", "");
  const [statusFilter, setStatusFilter] = usePageCache("admin:submissions:statusFilter", "all");
  const [eventFilter, setEventFilter] = usePageCache("admin:submissions:eventFilter", "all");
  const [converting, setConverting] = useState(false);

  type AnyRow = Contact | Sponsorship | Signup | Attendance | AlumniSubmission;
  const [detail, setDetail] = useState<{ tab: Tab; row: AnyRow } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ tab: Tab; row: AnyRow } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchAll = async () => {
    const [c, s, sg, ev, a, al] = await Promise.all([
      supabase.from("contact_submissions").select("*"),
      supabase.from("sponsorship_enquiries").select("*"),
      supabase.from("event_signups").select("*"),
      supabase.from("events").select("*"),
      supabase.from("attendance_submissions").select("*"),
      supabase.from("alumni_submissions").select("*"),
    ]);
    if (c.error || s.error || sg.error || ev.error || a.error || al.error) toast.error("Could not load submissions.");
    if (c.data) setContacts(c.data);
    if (s.data) setSponsorships(s.data);
    if (sg.data) setSignups(sg.data);
    if (ev.data) setEvents(ev.data);
    if (a.data) setAttendances(a.data);
    if (al.data) setAlumniSubs(al.data);
    setLoading(false);
  };

  // Alumni submissions are the one tab here with a required audit trail
  // (status changes and deletions) per the admin panel's stated guarantee
  // that admin actions are logged — the other three tabs predate that
  // requirement and are left as-is to keep this change scoped.
  const logAlumniChange = async (rowId: string, action: "update" | "delete", before: unknown, after: unknown) => {
    const { error } = await supabase.from("audit_log").insert({
      actor_user_id: session?.user.id ?? null,
      actor_email: session?.user.email ?? "unknown",
      table_name: "alumni_submissions",
      row_id: rowId,
      action,
      before: before as never,
      after: after as never,
    });
    if (error) console.error("Failed to write audit log entry for alumni_submissions", rowId, error);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSearch("");
    setStatusFilter("all");
    setEventFilter("all");
  }, [tab]);

  const eventTitle = (id: string) => events.find((e) => e.id === id)?.title ?? "Unknown event";

  const OTHER_EVENT_FILTER = "__other__";

  const attendanceEventLabel = (r: Attendance) =>
    r.event_id ? eventTitle(r.event_id) : `${r.other_event_name ?? "Unknown event"} (not listed)`;

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.message.toLowerCase().includes(q);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [contacts, statusFilter, search]);

  const filteredSponsorships = useMemo(() => {
    return sponsorships
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.message.toLowerCase().includes(q);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [sponsorships, statusFilter, search]);

  const filteredSignups = useMemo(() => {
    return signups
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => eventFilter === "all" || r.event_id === eventFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || (r.notes ?? "").toLowerCase().includes(q);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [signups, statusFilter, eventFilter, search]);

  const filteredAttendances = useMemo(() => {
    return attendances
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (eventFilter === "all") return true;
        if (eventFilter === OTHER_EVENT_FILTER) return r.event_id === null;
        return r.event_id === eventFilter;
      })
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q) || r.course.toLowerCase().includes(q);
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [attendances, statusFilter, eventFilter, search]);

  const filteredAlumniSubs = useMemo(() => {
    return alumniSubs
      .filter((r) => statusFilter === "all" || r.status === statusFilter)
      .filter((r) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (
          r.full_name.toLowerCase().includes(q) ||
          r.current_company.toLowerCase().includes(q) ||
          r.current_position.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [alumniSubs, statusFilter, search]);

  const tableFor = (t: Tab) =>
    t === "contact"
      ? "contact_submissions"
      : t === "sponsorship"
        ? "sponsorship_enquiries"
        : t === "signups"
          ? "event_signups"
          : t === "alumni"
            ? "alumni_submissions"
            : "attendance_submissions";

  const updateStatus = async (t: Tab, id: string, status: string, opts?: { silent?: boolean }) => {
    const before = t === "alumni" ? alumniSubs.find((r) => r.id === id) : undefined;
    const { error } = await supabase.from(tableFor(t)).update({ status }).eq("id", id);
    if (error) {
      if (!opts?.silent) toast.error("Could not update status.");
      return;
    }
    if (t === "contact") setContacts((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    if (t === "sponsorship") setSponsorships((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    if (t === "signups") setSignups((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    if (t === "attendance") setAttendances((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    if (t === "alumni") setAlumniSubs((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    setDetail((prev) => (prev && prev.row.id === id ? { ...prev, row: { ...prev.row, status } } : prev));
    if (!opts?.silent) toast.success("Status updated.");
    if (t === "alumni" && before) void logAlumniChange(id, "update", before, { ...before, status });
  };

  // Opening a "new" alumni submission is the only signal we have that an
  // admin has actually looked at it, so treat that as marking it reviewed —
  // silently, since the admin didn't explicitly choose a status change.
  // This is what keeps the Dashboard's "new submissions" count meaningful.
  const openDetail = (t: Tab, row: AnyRow) => {
    setDetail({ tab: t, row });
    if (t === "alumni" && "status" in row && row.status === "new") {
      void updateStatus("alumni", row.id, "reviewed", { silent: true });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const { error } = await supabase.from(tableFor(pendingDelete.tab)).delete().eq("id", pendingDelete.row.id);
    setDeleting(false);
    if (error) {
      toast.error("Could not delete that submission.");
      return;
    }
    if (pendingDelete.tab === "alumni") void logAlumniChange(pendingDelete.row.id, "delete", pendingDelete.row, null);
    toast.success("Deleted.");
    setPendingDelete(null);
    setDetail(null);
    fetchAll();
  };

  const convertToAlumni = async (submission: AlumniSubmission) => {
    setConverting(true);
    try {
      const newRow = await insertRow("alumni", {
        name: submission.full_name,
        firm: submission.current_company,
        role: submission.current_position,
        cohort: String(submission.graduation_year),
        linkedin_url: submission.linkedin_url,
        consent_confirmed: submission.consent_publish,
        degree_course: submission.degree_course,
        industry: submission.industry,
        mutis_position: submission.mutis_position,
      });

      if (submission.photo_url) {
        try {
          const photoRes = await fetch(submission.photo_url);
          const blob = await photoRes.blob();
          await supabase.storage.from("alumni_photos").upload(`${newRow.id}.jpeg`, blob, {
            contentType: "image/jpeg",
            upsert: true,
          });
        } catch (photoErr) {
          console.error("Failed to copy submitted photo to alumni_photos", photoErr);
          toast.error("Alumni entry created, but the photo couldn't be copied — upload it manually.");
        }
      }

      if (submission.status === "new") {
        await supabase.from("alumni_submissions").update({ status: "reviewed" }).eq("id", submission.id);
        setAlumniSubs((prev) => prev.map((r) => (r.id === submission.id ? { ...r, status: "reviewed" } : r)));
        void logAlumniChange(submission.id, "update", submission, { ...submission, status: "reviewed" });
      }

      toast.success("Added to the Alumni page as an unpublished draft — review and publish it there.");
      setDetail(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not convert this submission.");
    } finally {
      setConverting(false);
    }
  };

  const contactColumns: DataTableColumn<Contact>[] = [
    { key: "created_at", label: "Received", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "name", label: "Name", render: (r) => r.name, exportValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email, exportValue: (r) => r.email },
    { key: "reason", label: "Reason", render: (r) => r.reason, exportValue: (r) => r.reason },
    { key: "message", label: "Message", render: (r) => truncate(r.message, 60), exportValue: (r) => r.message },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDelete({ tab: "contact", row: r }); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-[14px] w-[14px]" />
        </button>
      ),
    },
  ];

  const sponsorshipColumns: DataTableColumn<Sponsorship>[] = [
    { key: "created_at", label: "Received", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "company", label: "Company", render: (r) => r.company, exportValue: (r) => r.company },
    { key: "name", label: "Name", render: (r) => r.name, exportValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email, exportValue: (r) => r.email },
    { key: "message", label: "Message", render: (r) => truncate(r.message, 60), exportValue: (r) => r.message },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDelete({ tab: "sponsorship", row: r }); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-[14px] w-[14px]" />
        </button>
      ),
    },
  ];

  const signupColumns: DataTableColumn<Signup>[] = [
    { key: "created_at", label: "Signed up", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "event", label: "Event", render: (r) => eventTitle(r.event_id), exportValue: (r) => eventTitle(r.event_id) },
    { key: "name", label: "Name", render: (r) => r.name, exportValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email, exportValue: (r) => r.email },
    { key: "notes", label: "Notes", render: (r) => (r.notes ? truncate(r.notes, 40) : "—"), exportValue: (r) => r.notes ?? "" },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDelete({ tab: "signups", row: r }); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-[14px] w-[14px]" />
        </button>
      ),
    },
  ];

  const attendanceColumns: DataTableColumn<Attendance>[] = [
    { key: "created_at", label: "Received", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "event", label: "Event", render: (r) => attendanceEventLabel(r), exportValue: (r) => attendanceEventLabel(r) },
    { key: "name", label: "Name", render: (r) => r.name, exportValue: (r) => r.name },
    { key: "email", label: "Email", render: (r) => r.email, exportValue: (r) => r.email },
    { key: "course", label: "Course", render: (r) => r.course, exportValue: (r) => r.course },
    { key: "year", label: "Year", render: (r) => r.year, exportValue: (r) => r.year },
    { key: "rating", label: "Rating", render: (r) => `${r.rating} / 5`, sortValue: (r) => r.rating },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDelete({ tab: "attendance", row: r }); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-[14px] w-[14px]" />
        </button>
      ),
    },
  ];

  const alumniColumns: DataTableColumn<AlumniSubmission>[] = [
    { key: "created_at", label: "Received", render: (r) => formatDateTime(r.created_at), sortValue: (r) => r.created_at },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, exportValue: (r) => r.status },
    { key: "full_name", label: "Name", render: (r) => r.full_name, exportValue: (r) => r.full_name },
    { key: "graduation_year", label: "Grad. year", render: (r) => String(r.graduation_year), sortValue: (r) => r.graduation_year },
    { key: "current_company", label: "Company", render: (r) => r.current_company, exportValue: (r) => r.current_company },
    { key: "current_position", label: "Position", render: (r) => r.current_position, exportValue: (r) => r.current_position },
    {
      key: "actions",
      label: "",
      render: (r) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); setPendingDelete({ tab: "alumni", row: r }); }} className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-[14px] w-[14px]" />
        </button>
      ),
    },
  ];

  const statusOptions =
    tab === "signups" ? ["confirmed", "cancelled"] : tab === "alumni" ? ["new", "reviewed", "archived"] : ["new", "read", "archived"];

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Submissions</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Inbox</h1>

      <div className="mt-[24px] flex flex-wrap items-center gap-[8px]">
        <div className="flex rounded-[10px] border border-border bg-card p-[3px]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-[8px] px-[14px] py-[8px] text-[12px]! font-medium transition-colors ${tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-[12px] top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-muted-foreground" />
          <input type="text" placeholder="Search name, email, message…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-[240px] rounded-[10px] border border-input bg-input py-[10px] pl-[36px] pr-[12px] text-[14px]! text-foreground outline-hidden transition-colors focus:border-accent" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
          <option value="all">All statuses</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        {(tab === "signups" || tab === "attendance") && (
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className="rounded-[10px] border border-input bg-input px-[12px] py-[10px] text-[13px]! text-foreground outline-hidden">
            <option value="all">All events</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
            {tab === "attendance" && <option value={OTHER_EVENT_FILTER}>Other (not listed)</option>}
          </select>
        )}
      </div>

      <div className="mt-[24px]">
        {loading ? (
          <div className="flex items-center justify-center py-[48px] text-muted-foreground">
            <Loader2 className="h-[18px] w-[18px] animate-spin" />
          </div>
        ) : tab === "contact" ? (
          <DataTable columns={contactColumns} data={filteredContacts} keyField={(r) => r.id} onRowClick={(r) => setDetail({ tab: "contact", row: r })} emptyMessage="No contact submissions." exportFilename="contact-submissions.csv" />
        ) : tab === "sponsorship" ? (
          <DataTable columns={sponsorshipColumns} data={filteredSponsorships} keyField={(r) => r.id} onRowClick={(r) => setDetail({ tab: "sponsorship", row: r })} emptyMessage="No sponsorship enquiries." exportFilename="sponsorship-enquiries.csv" />
        ) : tab === "signups" ? (
          <DataTable columns={signupColumns} data={filteredSignups} keyField={(r) => r.id} onRowClick={(r) => setDetail({ tab: "signups", row: r })} emptyMessage="No event signups." exportFilename="event-signups.csv" />
        ) : tab === "attendance" ? (
          <DataTable columns={attendanceColumns} data={filteredAttendances} keyField={(r) => r.id} onRowClick={(r) => setDetail({ tab: "attendance", row: r })} emptyMessage="No attendance submissions." exportFilename="attendance-submissions.csv" />
        ) : (
          <DataTable columns={alumniColumns} data={filteredAlumniSubs} keyField={(r) => r.id} onRowClick={(r) => openDetail("alumni", r)} emptyMessage="No alumni submissions." exportFilename="alumni-submissions.csv" />
        )}
      </div>

      <Drawer open={detail !== null} title="Submission" onClose={() => setDetail(null)}>
        {detail && (
          <div className="flex flex-col gap-[20px]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-[6px] text-[12px] text-muted-foreground">
                <InboxIcon className="h-[13px] w-[13px]" />
                {formatDateTime(detail.row.created_at)}
              </span>
              <select
                value={detail.row.status}
                onChange={(e) => updateStatus(detail.tab, detail.row.id, e.target.value)}
                className="rounded-[8px] border border-input bg-input px-[10px] py-[6px] text-[12px]! text-foreground outline-hidden"
              >
                {(detail.tab === "signups"
                  ? ["confirmed", "cancelled"]
                  : detail.tab === "alumni"
                    ? ["new", "reviewed", "archived"]
                    : ["new", "read", "archived"]
                ).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {detail.tab === "sponsorship" && "company" in detail.row && (
              <DetailRow label="Company" value={detail.row.company} />
            )}
            {detail.tab === "signups" && "event_id" in detail.row && (
              <DetailRow label="Event" value={eventTitle((detail.row as Signup).event_id)} />
            )}
            {detail.tab === "attendance" && "event_id" in detail.row && (
              <DetailRow label="Event" value={attendanceEventLabel(detail.row as Attendance)} />
            )}
            {detail.tab !== "alumni" && "name" in detail.row && <DetailRow label="Name" value={detail.row.name} />}
            {detail.tab !== "alumni" && "email" in detail.row && <DetailRow label="Email" value={detail.row.email} />}
            {detail.tab === "contact" && "reason" in detail.row && <DetailRow label="Reason" value={detail.row.reason} />}
            {detail.tab === "attendance" && "course" in detail.row && <DetailRow label="Course" value={detail.row.course} />}
            {detail.tab === "attendance" && "year" in detail.row && <DetailRow label="Year of study" value={detail.row.year} />}
            {detail.tab === "attendance" && "rating" in detail.row && <DetailRow label="Rating" value={`${detail.row.rating} / 5`} />}
            {"message" in detail.row && <DetailRow label="Message" value={detail.row.message} multiline />}
            {"notes" in detail.row && detail.row.notes && <DetailRow label="Notes" value={detail.row.notes} multiline />}
            {"comments" in detail.row && detail.row.comments && <DetailRow label="Comments" value={detail.row.comments} multiline />}

            {detail.tab === "alumni" && "full_name" in detail.row && (
              <>
                {detail.row.photo_url && (
                  <div className="flex flex-col gap-[4px]">
                    <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">Photo</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={detail.row.photo_url} alt="" className="h-[96px] w-[96px] rounded-full object-cover border border-border" />
                  </div>
                )}
                <DetailRow label="Full name" value={detail.row.full_name} />
                <DetailRow label="Graduation year" value={String(detail.row.graduation_year)} />
                {detail.row.degree_course && <DetailRow label="Degree / course" value={detail.row.degree_course} />}
                <DetailRow label="Current company" value={detail.row.current_company} />
                <DetailRow label="Current position" value={detail.row.current_position} />
                {detail.row.industry && <DetailRow label="Industry / division" value={detail.row.industry} />}
                {detail.row.linkedin_url && (
                  <div className="flex flex-col gap-[4px]">
                    <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">LinkedIn</span>
                    <a href={detail.row.linkedin_url} target="_blank" rel="noreferrer" className="text-[14px] text-accent underline">
                      {detail.row.linkedin_url}
                    </a>
                  </div>
                )}
                {detail.row.mutis_position && <DetailRow label="MUTIS involvement" value={detail.row.mutis_position} />}
                <DetailRow label="Permission to publish" value={detail.row.consent_publish ? "Yes" : "No"} />
                <DetailRow label="Privacy consent given" value={formatDateTime(detail.row.consent_at)} />
              </>
            )}

            <div className="mt-[8px] flex justify-end gap-[8px]">
              {detail.tab === "alumni" && "full_name" in detail.row && (
                <button
                  type="button"
                  disabled={converting}
                  onClick={() => convertToAlumni(detail.row as AlumniSubmission)}
                  className="inline-flex items-center gap-[6px] rounded-[10px] border border-border px-[16px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
                >
                  {converting ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <UserPlus className="h-[14px] w-[14px]" />}
                  Convert to alumni entry
                </button>
              )}
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
        title="Delete submission?"
        description="This will be permanently deleted. Consider changing its status to archived/cancelled instead unless this is spam or a test entry."
        confirmLabel={deleting ? "Deleting…" : "Delete"}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function DetailRow({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">{label}</span>
      <p className={`text-[14px] text-foreground ${multiline ? "leading-[1.6] whitespace-pre-wrap" : ""}`}>{value}</p>
    </div>
  );
}
