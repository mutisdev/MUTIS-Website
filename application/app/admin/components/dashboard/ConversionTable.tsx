const nf = new Intl.NumberFormat("en-GB");
const pct = new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 });

export interface ConversionRow {
  pageviews: number;
  visitors: number;
  signups: number;
  rate: number | null;
}

export interface Conversions {
  membership: ConversionRow;
  events: (ConversionRow & { eventId: string; title: string; startsAt: string | null })[];
}

// Rates can exceed 100% when a visitor's analytics beacon was blocked but the
// sign-up still reached the database — cap the display and flag it.
function Rate({ rate }: { rate: number | null }) {
  if (rate == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={rate >= 0.25 ? "text-accent" : "text-foreground"} title={rate > 1 ? "Some visitors block analytics" : undefined}>
      {rate > 1 ? ">100%" : pct.format(rate)}
    </span>
  );
}

export function ConversionTable({ data }: { data: Conversions }) {
  const rows = [
    { key: "membership", title: "Membership sign-up", sub: "/signup", ...data.membership },
    ...data.events.map((e) => ({
      ...e,
      key: e.eventId,
      sub: e.startsAt ? new Date(e.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Event",
    })),
  ];

  return (
    <div className="-mx-[16px] overflow-x-auto lg:-mx-[20px]">
      <table className="w-full min-w-[480px] text-left text-[12px]">
        <thead>
          <tr className="border-b border-border text-[10px] uppercase tracking-[0.06em] text-muted-foreground">
            <th className="px-[16px] py-[8px] font-medium lg:px-[20px]">Page</th>
            <th className="px-[8px] py-[8px] text-right font-medium">Visitors</th>
            <th className="px-[8px] py-[8px] text-right font-medium">Sign-ups</th>
            <th className="px-[16px] py-[8px] text-right font-medium lg:px-[20px]">Conversion</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="px-[16px] py-[10px] lg:px-[20px]">
                <span className="block truncate text-[13px] text-foreground">{row.title}</span>
                <span className="block text-[11px] text-muted-foreground">{row.sub}</span>
              </td>
              <td className="px-[8px] py-[10px] text-right tabular-nums text-muted-foreground">{nf.format(row.visitors)}</td>
              <td className="px-[8px] py-[10px] text-right tabular-nums text-foreground">{nf.format(row.signups)}</td>
              <td className="px-[16px] py-[10px] text-right tabular-nums lg:px-[20px]">
                <Rate rate={row.rate} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {data.events.length === 0 && (
        <p className="px-[16px] pt-[12px] text-[12px] text-muted-foreground lg:px-[20px]">
          No event sign-up pages visited in this range.
        </p>
      )}
    </div>
  );
}
