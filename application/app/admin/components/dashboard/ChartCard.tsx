import type { ReactNode } from "react";

// Hex mirrors of theme.css tokens — Recharts writes colours as SVG attributes,
// where CSS custom properties aren't reliable.
export const CHART_COLORS = {
  accent: "#15b8e1",
  secondary: "#7A9FD9",
  grid: "rgba(255, 255, 255, 0.06)",
  axis: "rgba(255, 255, 255, 0.45)",
};

export const tooltipProps = {
  contentStyle: {
    background: "#02123b",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: 10,
    fontSize: 12,
    color: "#f0f4f8",
  },
  labelStyle: { color: "rgba(255, 255, 255, 0.6)", marginBottom: 4 },
  cursor: { stroke: "rgba(255, 255, 255, 0.15)" },
};

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[10px] border border-border bg-input p-[2px]">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`rounded-[8px] px-[10px] py-[4px] text-[11px]! font-medium transition-colors ${
            value === opt.value ? "bg-accent/15 text-accent" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[14px] border border-border bg-card p-[16px] lg:p-[20px] ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-[12px]">
        <div>
          <h2 className="text-[13px] font-medium text-foreground">{title}</h2>
          {subtitle && <p className="mt-[2px] text-[12px] text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="mt-[16px]">{children}</div>
    </section>
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[6px] text-[11px] text-muted-foreground">
      <span className="h-[8px] w-[8px] rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
