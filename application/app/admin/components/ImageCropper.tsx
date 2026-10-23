import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Modal } from "./Modal";
import { cropImageStyle, type HeroCrop } from "@/app/lib/heroCrop";

/** Below this, the selected region is fewer pixels across than the banner will be drawn at
 * on a large screen, so it gets upscaled and looks soft. Warn rather than block — a slightly
 * soft banner is the admin's call to make. */
const SOFT_BELOW_PX = 1600;
/** Keeps a selection from being dragged down to nothing. */
const MIN_FRACTION = 0.08;

type Handle = "nw" | "ne" | "sw" | "se";
type DragState =
  | { kind: "move"; startX: number; startY: number; origin: HeroCrop }
  | { kind: "resize"; handle: Handle; startX: number; startY: number; origin: HeroCrop };

const FULL: HeroCrop = { x: 0, y: 0, w: 1, h: 1 };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/**
 * Lets an admin pick which part of a photo the page banner frames.
 *
 * Nothing is done to the file: the selection is returned as fractions of the full image and
 * stored alongside it, so it can be reopened and changed later. The preview on the right
 * uses the very same positioning helper the live banner uses (cropImageStyle), so what is
 * shown here is what the page renders.
 */
export function ImageCropper({
  open,
  src,
  initialCrop,
  onSave,
  onClose,
  saving = false,
}: {
  open: boolean;
  src: string;
  initialCrop: HeroCrop | null;
  onSave: (crop: HeroCrop | null) => void;
  onClose: () => void;
  saving?: boolean;
}) {
  const [crop, setCrop] = useState<HeroCrop>(initialCrop ?? FULL);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);

  // Reopening on a different row (or a different photo) starts from that row's own crop.
  useEffect(() => {
    if (open) setCrop(initialCrop ?? FULL);
  }, [open, src, initialCrop]);

  // Pointer handlers live on the window so a drag survives leaving the image.
  useEffect(() => {
    if (!open) return;

    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const frame = frameRef.current;
      if (!drag || !frame) return;
      const rect = frame.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const dx = (e.clientX - drag.startX) / rect.width;
      const dy = (e.clientY - drag.startY) / rect.height;
      const o = drag.origin;

      if (drag.kind === "move") {
        setCrop({
          ...o,
          x: Math.min(Math.max(0, o.x + dx), 1 - o.w),
          y: Math.min(Math.max(0, o.y + dy), 1 - o.h),
        });
        return;
      }

      // Resize from the dragged corner, keeping the opposite corner pinned.
      let { x, y, w, h } = o;
      if (drag.handle === "nw" || drag.handle === "sw") {
        const nx = Math.min(clamp01(o.x + dx), o.x + o.w - MIN_FRACTION);
        w = o.x + o.w - nx;
        x = nx;
      } else {
        w = Math.min(Math.max(MIN_FRACTION, o.w + dx), 1 - o.x);
      }
      if (drag.handle === "nw" || drag.handle === "ne") {
        const ny = Math.min(clamp01(o.y + dy), o.y + o.h - MIN_FRACTION);
        h = o.y + o.h - ny;
        y = ny;
      } else {
        h = Math.min(Math.max(MIN_FRACTION, o.h + dy), 1 - o.y);
      }
      setCrop({ x, y, w, h });
    };

    const onUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [open]);

  const startMove = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { kind: "move", startX: e.clientX, startY: e.clientY, origin: crop };
  };
  const startResize = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { kind: "resize", handle, startX: e.clientX, startY: e.clientY, origin: crop };
  };

  const isFull = crop.w > 0.999 && crop.h > 0.999 && crop.x < 0.001 && crop.y < 0.001;
  const selectedPx = natural ? Math.round(natural.w * crop.w) : null;
  const soft = selectedPx !== null && selectedPx < SOFT_BELOW_PX;

  const pct = (n: number) => `${(n * 100).toFixed(4)}%`;

  return (
    <Modal open={open} title="Choose what the banner shows" onClose={onClose} widthClass="max-w-[1000px]">
      <div className="flex flex-col gap-[20px] lg:flex-row">
        {/* ---- the photo with the selection over it ---- */}
        <div className="lg:flex-1">
          <div ref={frameRef} className="relative select-none overflow-hidden rounded-[12px] border border-border bg-input">
            <img
              src={src}
              alt=""
              draggable={false}
              onLoad={(e) =>
                setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
              }
              className="block w-full"
            />
            {/* Everything outside the selection is dimmed, via four panels rather than a
                box-shadow so the edges stay crisp at any zoom. */}
            <div className="pointer-events-none absolute inset-x-0 top-0 bg-black/55" style={{ height: pct(crop.y) }} />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55" style={{ height: pct(1 - crop.y - crop.h) }} />
            <div className="pointer-events-none absolute left-0 bg-black/55" style={{ top: pct(crop.y), height: pct(crop.h), width: pct(crop.x) }} />
            <div className="pointer-events-none absolute right-0 bg-black/55" style={{ top: pct(crop.y), height: pct(crop.h), width: pct(1 - crop.x - crop.w) }} />

            <div
              onPointerDown={startMove}
              className="absolute cursor-move border-2 border-white/90"
              style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
            >
              {(["nw", "ne", "sw", "se"] as Handle[]).map((handle) => (
                <span
                  key={handle}
                  onPointerDown={startResize(handle)}
                  className={`absolute h-[16px] w-[16px] rounded-[3px] border border-black/30 bg-white ${
                    handle === "nw"
                      ? "left-[-8px] top-[-8px] cursor-nwse-resize"
                      : handle === "ne"
                        ? "right-[-8px] top-[-8px] cursor-nesw-resize"
                        : handle === "sw"
                          ? "bottom-[-8px] left-[-8px] cursor-nesw-resize"
                          : "bottom-[-8px] right-[-8px] cursor-nwse-resize"
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="mt-[10px] text-[12px] leading-[1.6] text-muted-foreground">
            Drag the box to move it, or its corners to resize. Everything shaded is left out of
            the banner. The photo itself is never changed — you can come back and adjust this at
            any time.
          </p>
        </div>

        {/* ---- live preview at the real banner proportions ---- */}
        <div className="lg:w-[380px] lg:shrink-0">
          <p className="mb-[8px] text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Banner preview
          </p>
          <div className="relative overflow-hidden rounded-[12px] border border-border" style={{ aspectRatio: "1440 / 612" }}>
            {/* Deliberately the same .page-hero-photo markup and CSS the live banner uses,
                so this preview cannot drift from what the page actually renders. */}
            <div className="page-hero-photo">
              <img src={src} alt="" draggable={false} style={cropImageStyle(crop)} />
            </div>
            {/* The same scrim the live banner uses, so legibility can be judged here. */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(100deg, rgba(2,5,13,0.58) 0%, rgba(2,5,13,0.40) 45%, rgba(2,5,13,0.50) 78%, rgba(2,5,13,0.64) 100%), linear-gradient(180deg, rgba(2,5,13,0.28) 0%, rgba(2,5,13,0.0) 45%, rgba(2,5,13,0.52) 100%)",
              }}
            />
            <div className="absolute inset-x-0 bottom-0 px-[18px] pb-[14px]">
              <div className="text-[7px] uppercase tracking-[0.28em] text-white/75" style={{ textShadow: "0 1px 3px rgba(2,5,13,0.55)" }}>
                MUTIS / PAGE
              </div>
              <div className="mt-[6px] font-serif text-[26px] leading-none text-[#dceaf5]" style={{ textShadow: "0 1px 3px rgba(2,5,13,0.55), 0 2px 26px rgba(2,5,13,0.7)" }}>
                Page title
              </div>
            </div>
          </div>
          <p className="mt-[10px] text-[12px] leading-[1.6] text-muted-foreground">
            This is a wide screen. On a phone the banner is a narrower, taller shape: your
            selection stays centred and its left and right edges get trimmed.
          </p>
          {soft && (
            <p className="mt-[10px] rounded-[10px] border border-amber-500/30 bg-amber-500/10 p-[10px] text-[12px] leading-[1.6] text-amber-200">
              That selection is only {selectedPx}px across, so it will look soft on a large
              screen. Select a wider area, or upload a higher-resolution photo.
            </p>
          )}
        </div>
      </div>

      <div className="mt-[24px] flex items-center justify-end gap-[8px] border-t border-border pt-[20px]">
        <button
          type="button"
          onClick={() => setCrop(FULL)}
          disabled={saving || isFull}
          className="rounded-[10px] border border-border px-[14px] py-[10px] text-[13px] font-medium text-foreground transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          Reset to full image
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="rounded-[10px] border border-border px-[14px] py-[10px] text-[13px] font-medium text-muted-foreground transition-colors hover:bg-white/5 disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(isFull ? null : crop)}
          disabled={saving}
          className="inline-flex items-center gap-[6px] rounded-[10px] bg-foreground px-[16px] py-[10px] text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving && <Loader2 className="h-[14px] w-[14px] animate-spin" />}
          Save crop
        </button>
      </div>
    </Modal>
  );
}
