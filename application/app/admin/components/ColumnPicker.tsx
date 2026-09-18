import { useEffect, useId, useRef, useState } from "react";
import { Columns3 } from "lucide-react";

export interface ColumnPickerGroup {
  label: string;
  columns: { key: string; label: string }[];
}

/**
 * "Columns" button with a popover of grouped checkboxes for switching
 * optional table columns on and off. Controlled: the page owns the set of
 * enabled keys (and so decides what's on by default).
 */
export function ColumnPicker({
  groups,
  enabled,
  onChange,
}: {
  groups: ColumnPickerGroup[];
  enabled: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const onCount = groups.reduce((n, g) => n + g.columns.filter((c) => enabled.has(c.key)).length, 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = (key: string) => {
    const next = new Set(enabled);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  const setGroup = (group: ColumnPickerGroup, on: boolean) => {
    const next = new Set(enabled);
    for (const c of group.columns) {
      if (on) next.add(c.key);
      else next.delete(c.key);
    }
    onChange(next);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-[6px] rounded-[10px] border border-border bg-card px-[12px] py-[8px] text-[12px] font-medium text-foreground transition-colors hover:bg-white/[0.03]"
      >
        <Columns3 className="h-[14px] w-[14px]" />
        Columns{onCount > 0 ? ` (+${onCount})` : ""}
      </button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-20 mt-[6px] w-[260px] rounded-[12px] border border-border bg-[#02123b] p-[12px] shadow-lg"
        >
          {groups.map((group) => {
            const allOn = group.columns.every((c) => enabled.has(c.key));
            return (
              <fieldset key={group.label} className="flex flex-col gap-[6px] [&+&]:mt-[12px]">
                <div className="flex items-center justify-between">
                  <legend className="text-[10px] font-medium uppercase tracking-[0.06em] text-muted-foreground">
                    {group.label}
                  </legend>
                  <button
                    type="button"
                    onClick={() => setGroup(group, !allOn)}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    {allOn ? "Hide all" : "Show all"}
                  </button>
                </div>
                {group.columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-[8px] py-[2px] text-[13px] text-foreground">
                    <input
                      type="checkbox"
                      checked={enabled.has(c.key)}
                      onChange={() => toggle(c.key)}
                      className="h-[14px] w-[14px] accent-[#15b8e1]"
                    />
                    {c.label}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      )}
    </div>
  );
}
