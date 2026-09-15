import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_COLORS, LegendDot, tooltipProps } from "./ChartCard";

export interface TrendPoint {
  bucket: string;
  member_signups: number;
  event_signups: number;
}

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function TrendChart({ data, bucket }: { data: TrendPoint[]; bucket: "day" | "week" }) {
  return (
    <>
      <div className="mb-[8px] flex gap-[16px]">
        <LegendDot color={CHART_COLORS.accent} label="Members" />
        <LegendDot color={CHART_COLORS.secondary} label="Event sign-ups" />
      </div>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -24 }}>
            <CartesianGrid stroke={CHART_COLORS.grid} vertical={false} />
            <XAxis
              dataKey="bucket"
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
            <Tooltip
              {...tooltipProps}
              labelFormatter={(label) => (bucket === "week" ? `Week of ${shortDate(String(label))}` : shortDate(String(label)))}
            />
            <Line
              type="monotone"
              dataKey="member_signups"
              name="Members"
              stroke={CHART_COLORS.accent}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="event_signups"
              name="Event sign-ups"
              stroke={CHART_COLORS.secondary}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}
