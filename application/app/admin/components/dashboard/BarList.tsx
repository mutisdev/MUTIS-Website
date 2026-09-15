const nf = new Intl.NumberFormat("en-GB");

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** Shown on hover, e.g. the raw URL behind a resolved page title. */
  title?: string;
}

/** Ranked horizontal list with a proportional bar under each row. */
export function BarList({ items, empty = "No data in this range." }: { items: BarListItem[]; empty?: string }) {
  if (items.length === 0) {
    return <p className="py-[32px] text-center text-[13px] text-muted-foreground">{empty}</p>;
  }
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className="flex flex-col gap-[10px]">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-[12px] text-[12px]">
            <span className="truncate text-foreground" title={item.title ?? item.label}>
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{nf.format(item.value)}</span>
          </div>
          <div className="mt-[4px] h-[3px] rounded-full bg-white/5">
            <div className="h-full rounded-full bg-accent/70" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
