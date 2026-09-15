import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, LegendDot, tooltipProps } from "./ChartCard";

export interface TrafficPoint {
  timestamp: string;
  pageviews: number;
  visitors: number;
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function TrafficChart({ data }: { data: TrafficPoint[] }) {
  return (
    <>
      <div className="mb-[8px] flex gap-[16px]">
        <LegendDot color={CHART_COLORS.accent} label="Page views" />
        <LegendDot color={CHART_COLORS.secondary} label="Visitors" />
      </div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id="traffic-pageviews" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART_COLORS.accent} stopOpacity={0.3} />
                <stop offset="100%" stopColor={CHART_COLORS.accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="timestamp"
              tickFormatter={shortDate}
              tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: CHART_COLORS.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip {...tooltipProps} labelFormatter={(label) => shortDate(String(label))} />
            <Area
              type="monotone"
              dataKey="pageviews"
              name="Page views"
              stroke={CHART_COLORS.accent}
              strokeWidth={2}
              fill="url(#traffic-pageviews)"
            />
            <Area
              type="monotone"
              dataKey="visitors"
              name="Visitors"
              stroke={CHART_COLORS.secondary}
              strokeWidth={2}
              fill="transparent"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
