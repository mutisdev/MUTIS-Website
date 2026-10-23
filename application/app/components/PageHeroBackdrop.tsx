import { cropImageStyle, parseCrop, type HeroCrop } from "@/app/lib/heroCrop";

/** The admin-uploaded photo for a subpage hero, rendered as the full-bleed backdrop of the
 * whole section — the same overlay and film-grain layers the homepage hero uses, reusing
 * its classes so the two look identical. Together with the `:has(.page-hero-photo)` rules
 * in mutis-subpage.css this turns the blue bar into a photo hero.
 *
 * The photo is an <img> rather than a background-image so that `crop` can frame a chosen
 * part of it (see cropImageStyle). Returns null when no photo is set, leaving the page its
 * plain gradient bar. */
export function PageHeroBackdrop({ src, crop }: { src: string | null; crop?: HeroCrop | unknown }) {
  if (!src) return null;
  return (
    <>
      <div className="page-hero-photo">
        <img src={src} alt="" decoding="async" style={cropImageStyle(parseCrop(crop))} />
      </div>
      <div className="pm-hero-overlay" />
      <div className="pm-hero-grain" aria-hidden="true" />
    </>
  );
}
