/**
 * The selection an admin drew over a page-background photo, as fractions of the full
 * image. Stored in page_backgrounds.crop; null everywhere means "the whole image".
 */
/* A type alias rather than an interface on purpose: an interface has no implicit index
 * signature, so it cannot be assigned to Supabase's `Json` column type when the crop is
 * written back to page_backgrounds. */
export type HeroCrop = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const inRange = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

/**
 * Range-checks a value coming out of the database (or a hand-edited row) and returns null
 * for anything that isn't a usable selection, so a bad value degrades to the uncropped
 * banner rather than producing a broken one.
 */
export function parseCrop(value: unknown): HeroCrop | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { x, y, w, h } = value as Record<string, unknown>;
  if (!inRange(x) || !inRange(y) || !inRange(w) || !inRange(h)) return null;
  if (w <= 0 || h <= 0) return null;
  // Allow a hair over 1 for rounding coming back from the cropper's pixel maths.
  if (x + w > 1.0001 || y + h > 1.0001) return null;
  return { x, y, w, h };
}

/**
 * Positions an <img> inside a hero-sized box so that `crop` fills it.
 *
 * The img box is the *whole* image's footprint, scaled up so the selection alone measures
 * 100% of the hero, then offset so the selection's top-left corner lands on the hero's.
 * `object-fit: cover` (set in CSS) then resolves any difference between the selection's
 * shape and the hero's by centre-cropping — which is exactly the intended behaviour on
 * narrow screens: the selection stays centred and its sides are trimmed.
 *
 * No image dimensions and no measurement are needed, so there is nothing to wait for and
 * no reflow once the file loads.
 */
export function cropImageStyle(crop: HeroCrop | null): React.CSSProperties {
  if (!crop) {
    // The framing the banner has always used: fill the bar, anchored to the top.
    return { width: "100%", height: "100%", left: 0, top: 0, objectPosition: "center top" };
  }
  return {
    width: `${100 / crop.w}%`,
    height: `${100 / crop.h}%`,
    left: `${(-100 * crop.x) / crop.w}%`,
    top: `${(-100 * crop.y) / crop.h}%`,
    objectPosition: "center",
  };
}
