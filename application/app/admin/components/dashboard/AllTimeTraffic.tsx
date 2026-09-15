import { useEffect } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { usePageCache } from "../../usePageCache";
import { labelPaths } from "../../lib/pageLabels";
import { BarList, type BarListItem } from "./BarList";
import { CHART_COLORS, ChartCard, tooltipProps } from "./ChartCard";

type Totals = Database["public"]["Views"]["site_traffic_totals"]["Row"];
type MonthRow = Database["public"]["Views"]["site_traffic_monthly_summary"]["Row"];

interface AllTimeData {
  totals: Totals | null;
  months: MonthRow[];
  topPages: BarListItem[];
  topReferrers: BarListItem[];
}

const nf = new Intl.NumberFormat("en-GB");
const monthLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

/**
 * Lifetime traffic from the nightly Supabase snapshots (site_traffic_*), which
 * outlive Vercel Hobby's 1-month retention. Independent of the live range toggle.
 */
export function AllTimeTraffic() {
  const [data, setData] = usePageCache<AllTimeData | null>("admin:dashboard:allTime", null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [totals, months, pages, referrers] = await Promise.all([
        supabase.from("site_traffic_totals").select("*").single(),
        supabase.from("site_traffic_monthly_summary").select("*").order("month"),
        supabase.rpc("site_traffic_top", { p_dimension: "page", p_limit: 10 }),
        supabase.rpc("site_traffic_top", { p_dimension: "referrer", p_limit: 8 }),
      ]);
      const labels = await labelPaths((pages.data ?? []).map((p) => p.value));
      if (cancelled) return;

      const trackedSince = totals.data?.tracked_since;
      setData({
        totals: totals.data ?? null,
        // Drop zero months from before Web Analytics was switched on.
        months: (months.data ?? []).filter((m) => trackedSince && m.month && m.month >= trackedSince.slice(0, 8) + "01"),
        topPages: (pages.data ?? []).map((p) => ({
          key: p.value,
          label: labels.get(p.value) ?? p.value,
          value: Number(p.pageviews),
          title: p.value,
        })),
        topReferrers: (referrers.data ?? []).map((r) => ({
          key: r.value,
          label: r.value === "(none)" ? "Direct / none" : r.value,
          value: Number(r.pageviews),
        })),
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const since = data?.totals?.tracked_since
    ? new Date(data.totals.tracked_since).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <>
      <p className="mb-[8px] mt-[32px] text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
        All time{since ? ` · since ${since}` : ""}
      </p>
      <div className="grid grid-cols-1 gap-[12px] lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-3"
          title="Monthly page views"
          subtitle={
            data?.totals
              ? `${nf.format(data.totals.lifetime_pageviews ?? 0)} page views in total · saved nightly from Vercel`
              : "Saved nightly from Vercel"
          }
        >
          {!data ? (
            <Spinner />
          ) : data.months.length === 0 ? (
            <Empty>No snapshots yet — the first runs tonight at 00:30 UTC.</Empty>
          ) : (
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.months} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabel}
                    tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis allowDecimals={false} tick={{ fill: CHART_COLORS.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...tooltipProps}
                    cursor={{ fill: "rgba(255, 255, 255, 0.04)" }}
                    labelFormatter={(label) => monthLabel(String(label))}
                    formatter={(value, _name, item) => {
                      const uniques = (item.payload as MonthRow).unique_visitors;
                      return [
                        `${nf.format(Number(value))}${uniques != null ? ` · ${nf.format(uniques)} unique visitors` : ""}`,
                        "Page views",
                      ];
                    }}
                  />
                  <Bar dataKey="pageviews" fill={CHART_COLORS.accent} radius={[4, 4, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard className="lg:col-span-2" title="Top pages" subtitle="Page views, all time">
          {!data ? <Spinner /> : <BarList items={data.topPages} empty="No snapshots yet." />}
        </ChartCard>

        <ChartCard title="Top referrers" subtitle="Page views, all time">
          {!data ? <Spinner /> : <BarList items={data.topReferrers} empty="No snapshots yet." />}
        </ChartCard>
      </div>
    </>
  );
}

function Spinner() {
  return (
    <div className="flex h-[160px] items-center justify-center text-muted-foreground">
      <Loader2 className="h-[18px] w-[18px] animate-spin" />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-[32px] text-center text-[13px] text-muted-foreground">{children}</p>;
}
