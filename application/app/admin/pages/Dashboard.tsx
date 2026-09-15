import { Link } from "react-router";
import { useEffect } from "react";
import type { ComponentType } from "react";
import { Users, UserPlus, CalendarCheck, CalendarPlus, Eye, Loader2 } from "lucide-react";
import { useAuth } from "../AuthProvider";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { usePageCache } from "../usePageCache";
import { StatusBadge } from "../components/StatusBadge";
import { ChartCard, Segmented } from "../components/dashboard/ChartCard";
import { TrendChart, type TrendPoint } from "../components/dashboard/TrendChart";
import { TrafficChart, type TrafficPoint } from "../components/dashboard/TrafficChart";
import { BarList } from "../components/dashboard/BarList";
import { ConversionTable, type Conversions } from "../components/dashboard/ConversionTable";
import { AllTimeTraffic } from "../components/dashboard/AllTimeTraffic";

type SignupSummary = Database["public"]["Views"]["dashboard_signup_summary"]["Row"];
type TrendRange = "30d" | "60d";
type TrafficRange = "7d" | "30d" | "60d";

interface RecentMember {
  id: string;
  full_name: string;
  course: string;
  year: string;
  created_at: string;
}

interface RecentEventSignup {
  id: string;
  name: string;
  status: string;
  created_at: string;
  events: { title: string } | null;
}

interface VercelAnalytics {
  configured: boolean;
  error?: string;
  range?: TrafficRange;
  totals?: { pageviews: number; visitors: number };
  weekVisitors?: number;
  timeseries?: TrafficPoint[];
  /** `label` is the human title (event/article name resolved server-side); `path` is the raw URL. */
  topPages?: { path: string; label: string; pageviews: number; visitors: number }[];
  /** null = that breakdown failed on Vercel's side; the rest still loaded. */
  referrers?: BreakdownRow[] | null;
  devices?: BreakdownRow[] | null;
  countries?: BreakdownRow[] | null;
  breakdownErrors?: Partial<Record<"referrers" | "devices" | "countries", string>>;
  conversions?: Conversions;
}

const TREND_CONFIG: Record<TrendRange, { days: number; bucket: "day" | "week" }> = {
  "30d": { days: 30, bucket: "day" },
  "60d": { days: 60, bucket: "week" },
};

const nf = new Intl.NumberFormat("en-GB");

function relativeTime(iso: string) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function Dashboard() {
  const { session } = useAuth();
  const [summary, setSummary] = usePageCache<SignupSummary | null>("admin:dashboard:summary", null);
  const [trendRange, setTrendRange] = usePageCache<TrendRange>("admin:dashboard:trendRange", "30d");
  const [trend, setTrend] = usePageCache<Partial<Record<TrendRange, TrendPoint[]>>>("admin:dashboard:trend", {});
  const [recentMembers, setRecentMembers] = usePageCache<RecentMember[] | null>("admin:dashboard:recentMembers", null);
  const [recentEvents, setRecentEvents] = usePageCache<RecentEventSignup[] | null>("admin:dashboard:recentEvents", null);
  const [trafficRange, setTrafficRange] = usePageCache<TrafficRange>("admin:dashboard:trafficRange", "7d");
  const [traffic, setTraffic] = usePageCache<Partial<Record<TrafficRange, VercelAnalytics>>>("admin:dashboard:traffic", {});

  // Summary + recent activity — fetched once per mount.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("dashboard_signup_summary")
      .select("*")
      .single()
      .then(({ data }) => {
        if (!cancelled && data) setSummary(data);
      });
    supabase
      .from("membership_signups")
      .select("id, full_name, course, year, created_at")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!cancelled) setRecentMembers(data ?? []);
      });
    supabase
      .from("event_signups")
      .select("id, name, status, created_at, events(title)")
      .order("created_at", { ascending: false })
      .limit(8)
      .then(({ data }) => {
        if (!cancelled) setRecentEvents((data as RecentEventSignup[] | null) ?? []);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    const { days, bucket } = TREND_CONFIG[trendRange];
    supabase.rpc("dashboard_signup_trend", { p_days: days, p_bucket: bucket }).then(({ data }) => {
      if (!cancelled && data) setTrend((prev) => ({ ...prev, [trendRange]: data }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendRange]);

  useEffect(() => {
    let cancelled = false;
    supabase.functions
      .invoke<VercelAnalytics>("vercel-analytics", { body: { range: trafficRange } })
      .then(({ data, error }) => {
        if (cancelled) return;
        setTraffic((prev) => ({
          ...prev,
          [trafficRange]: data ?? { configured: true, error: error?.message ?? "Could not load site traffic." },
        }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trafficRange]);

  const currentTrend = trend[trendRange];
  const currentTraffic = traffic[trafficRange];
  // The 7-day visitors KPI is returned with every range, so use whichever response we have.
  const weekVisitors = Object.values(traffic).find((t) => t?.weekVisitors != null)?.weekVisitors;
  const vercelNotConfigured = currentTraffic?.configured === false;

  const statCards: { label: string; value: number | null | undefined; icon: ComponentType<{ className?: string }> }[] = [
    { label: "Total members", value: summary?.total_members, icon: Users },
    { label: "New members (7 days)", value: summary?.members_7d, icon: UserPlus },
    { label: "Event sign-ups", value: summary?.total_event_signups, icon: CalendarCheck },
    { label: "New event sign-ups (7 days)", value: summary?.event_signups_7d, icon: CalendarPlus },
    { label: "Site visitors (7 days)", value: weekVisitors, icon: Eye },
  ];

  const rangeLabel = `last ${trafficRange.replace("d", " days")}`;

  // Shared loading / not-connected / error states for every Vercel-backed card.
  const renderTraffic = (render: (t: VercelAnalytics) => React.ReactNode) => {
    if (vercelNotConfigured) return <EmptyState>Connect Vercel in Integrations to see this.</EmptyState>;
    if (currentTraffic?.error) return <EmptyState>Couldn't load from Vercel.</EmptyState>;
    if (!currentTraffic) return <ChartPlaceholder height="h-[160px]" />;
    return render(currentTraffic);
  };

  return (
    <div className="px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">MUTIS Admin</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Welcome, {session?.user.email}</h1>
      <p className="mt-[12px] text-[14px] leading-[1.6] text-muted-foreground">Sign-ups and site traffic at a glance.</p>

      <div className="mt-[24px] grid grid-cols-2 gap-[12px] md:grid-cols-3 xl:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-[14px] border border-border bg-card p-[16px]">
              <span className="flex h-[32px] w-[32px] items-center justify-center rounded-[10px] border border-border bg-input text-accent">
                <Icon className="h-[15px] w-[15px]" />
              </span>
              <p className="mt-[12px] text-[22px] font-medium text-foreground">
                {card.value == null ? "—" : nf.format(card.value)}
              </p>
              <p className="mt-[2px] text-[12px] text-muted-foreground">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-[24px] grid grid-cols-1 gap-[12px] xl:grid-cols-2">
        <ChartCard
          title="Sign-up trend"
          subtitle={trendRange === "30d" ? "Daily, last 30 days" : "Weekly, last 60 days"}
          action={
            <Segmented
              label="Sign-up trend range"
              value={trendRange}
              onChange={setTrendRange}
              options={[
                { value: "30d", label: "30d" },
                { value: "60d", label: "60d" },
              ]}
            />
          }
        >
          {currentTrend ? (
            <TrendChart data={currentTrend} bucket={TREND_CONFIG[trendRange].bucket} />
          ) : (
            <ChartPlaceholder />
          )}
        </ChartCard>

        <ChartCard
          title="Site traffic"
          subtitle={
            currentTraffic?.totals
              ? `${nf.format(currentTraffic.totals.pageviews)} page views · ${nf.format(currentTraffic.totals.visitors)} visitors`
              : "Vercel Web Analytics"
          }
          action={
            !vercelNotConfigured && (
              <Segmented
                label="Site traffic range"
                value={trafficRange}
                onChange={setTrafficRange}
                options={[
                  { value: "7d", label: "7d" },
                  { value: "30d", label: "30d" },
                  { value: "60d", label: "60d" },
                ]}
              />
            )
          }
        >
          {vercelNotConfigured ? (
            <EmptyState>
              Vercel Web Analytics isn't connected yet.{" "}
              <Link to="/admin/integrations" className="text-accent hover:underline">
                Add an access token
              </Link>
            </EmptyState>
          ) : currentTraffic?.error ? (
            <EmptyState>{currentTraffic.error}</EmptyState>
          ) : currentTraffic?.timeseries ? (
            <TrafficChart data={currentTraffic.timeseries} />
          ) : (
            <ChartPlaceholder />
          )}
        </ChartCard>
      </div>

      <div className="mt-[12px] grid grid-cols-1 gap-[12px] lg:grid-cols-3">
        <ChartCard title="Latest members" action={<ViewAll to="/admin/membership-signups" />}>
          <ActivityList
            rows={recentMembers}
            empty="No membership sign-ups yet."
            render={(m) => (
              <>
                <ActivityText primary={m.full_name} secondary={[m.course, m.year].filter(Boolean).join(" · ")} />
                <time className="shrink-0 text-[11px] text-muted-foreground" dateTime={m.created_at}>
                  {relativeTime(m.created_at)}
                </time>
              </>
            )}
          />
        </ChartCard>

        <ChartCard title="Latest event sign-ups" action={<ViewAll to="/admin/events" />}>
          <ActivityList
            rows={recentEvents}
            empty="No event sign-ups yet."
            render={(s) => (
              <>
                <ActivityText primary={s.name} secondary={s.events?.title ?? "Deleted event"} />
                <span className="flex shrink-0 flex-col items-end gap-[4px]">
                  <time className="text-[11px] text-muted-foreground" dateTime={s.created_at}>
                    {relativeTime(s.created_at)}
                  </time>
                  {s.status !== "confirmed" && <StatusBadge status={s.status} />}
                </span>
              </>
            )}
          />
        </ChartCard>

        <ChartCard title="Top pages" subtitle={`Page views, ${rangeLabel}`}>
          {renderTraffic((t) => (
            <BarList
              items={(t.topPages ?? []).map((p) => ({ key: p.path, label: p.label, value: p.pageviews, title: p.path }))}
            />
          ))}
        </ChartCard>
      </div>

      <p className="mb-[8px] mt-[32px] text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        Audience · {rangeLabel}
      </p>
      <div className="grid grid-cols-1 gap-[12px] lg:grid-cols-3">
        <ChartCard title="Traffic sources" subtitle="Visitors by referring site">
          {renderTraffic((t) => (
            <Breakdown rows={t.referrers} error={t.breakdownErrors?.referrers} label={(name) => name} />
          ))}
        </ChartCard>

        <ChartCard title="Devices" subtitle="Visitors">
          {renderTraffic((t) => (
            <Breakdown rows={t.devices} error={t.breakdownErrors?.devices} label={capitalise} />
          ))}
        </ChartCard>

        <ChartCard title="Countries" subtitle="Visitors">
          {renderTraffic((t) => (
            <Breakdown rows={t.countries} error={t.breakdownErrors?.countries} label={countryName} />
          ))}
        </ChartCard>
      </div>

      <ChartCard
        className="mt-[12px]"
        title="Sign-up conversion"
        subtitle={`Unique visitors to each sign-up page vs sign-ups received, ${rangeLabel}`}
      >
        {renderTraffic((t) => (t.conversions ? <ConversionTable data={t.conversions} /> : <EmptyState>—</EmptyState>))}
      </ChartCard>

      <AllTimeTraffic />
    </div>
  );
}

type BreakdownRow = { name: string; pageviews: number; visitors: number };
function Breakdown({
  rows,
  error,
  label,
}: {
  rows: BreakdownRow[] | null | undefined;
  error?: string;
  label: (name: string) => string;
}) {
  if (rows === null) {
    // Vercel gates some dimensions by plan — surface its reason, not a generic failure.
    const reason = error?.match(/"message":"([^"]+)"/)?.[1];
    return <EmptyState>{reason ?? "Couldn't load this breakdown from Vercel."}</EmptyState>;
  }
  return <BarList items={(rows ?? []).map((r) => ({ key: r.name, label: label(r.name), value: r.visitors }))} />;
}

const regionNames = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en-GB"], { type: "region" }) : null;

function countryName(code: string) {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ChartPlaceholder({ height = "h-[244px]" }: { height?: string }) {
  return (
    <div className={`flex ${height} items-center justify-center text-muted-foreground`}>
      <Loader2 className="h-[18px] w-[18px] animate-spin" />
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[120px] items-center justify-center px-[16px] text-center text-[13px] leading-[1.6] text-muted-foreground">
      <p>{children}</p>
    </div>
  );
}

function ViewAll({ to }: { to: string }) {
  return (
    <Link to={to} className="text-[11px] font-medium text-accent hover:underline">
      View all
    </Link>
  );
}

function ActivityText({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <span className="min-w-0">
      <span className="block truncate text-[13px] text-foreground">{primary}</span>
      <span className="block truncate text-[12px] text-muted-foreground">{secondary}</span>
    </span>
  );
}

function ActivityList<T extends { id: string }>({
  rows,
  empty,
  render,
}: {
  rows: T[] | null;
  empty: string;
  render: (row: T) => React.ReactNode;
}) {
  if (rows === null) return <ChartPlaceholder height="h-[160px]" />;
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <ul className="-my-[8px] divide-y divide-border">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-[12px] py-[8px]">
          {render(row)}
        </li>
      ))}
    </ul>
  );
}
