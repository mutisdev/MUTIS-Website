import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type GalleryImageRow = Tables<"gallery_images">;

const ALL = "All";
// Tab for photos with no category, shown only once some photos have one.
const OTHER = "Other";

function categoryOf(img: GalleryImageRow) {
  return img.category?.trim() || OTHER;
}

export function Gallery() {
  const [images, setImages] = useState<GalleryImageRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const loadImages = async () => {
      setIsLoading(true);
      setLoadError("");

      const { data, error } = await supabase
        .from("gallery_images")
        .select("*")
        .eq("is_published", true)
        .order("display_order");

      if (cancelled) return;

      if (error) {
        console.error("Failed to load gallery images", error);
        setLoadError("We could not load this page right now. Please refresh the page.");
        setImages([]);
        setIsLoading(false);
        return;
      }

      setImages(data ?? []);
      setIsLoading(false);
    };

    void loadImages();

    return () => {
      cancelled = true;
    };
  }, []);

  // Tabs follow the admin's photo order: a category sits where its first photo does.
  const categories = useMemo(() => {
    const seen = new Set<string>();
    for (const img of images) seen.add(categoryOf(img));
    if (seen.size <= 1 && seen.has(OTHER)) return [];
    // "Other" always goes last so named categories lead.
    const named = [...seen].filter((c) => c !== OTHER);
    return seen.has(OTHER) ? [...named, OTHER] : named;
  }, [images]);

  // The active tab lives in the URL so a category can be linked to directly.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("category");
  const activeCategory = requested && categories.includes(requested) ? requested : ALL;
  const selectCategory = (category: string) => {
    setSearchParams(category === ALL ? {} : { category }, { replace: true, preventScrollReset: true });
  };

  const visibleImages = useMemo(
    () => (activeCategory === ALL ? images : images.filter((img) => categoryOf(img) === activeCategory)),
    [images, activeCategory]
  );

  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useReveal([images.length, isLoading, loadError]);
  const bgImage = usePageBackgroundImage("gallery");

  return (
    <>
      <section className="page-hero" style={heroBackgroundStyle(bgImage)}>
        <div className="page-hero-inner">
          <div>
            <div className="crumb">
              <Link to="/">MUTIS</Link><span>/</span><span>Media</span><span>/</span><span>Gallery</span>
            </div>
            <div className="page-eyebrow r-up"><span className="bar" />Media</div>
            <h1 className="page-title r-up"><span className="accent">Gallery</span></h1>
          </div>
          <p className="page-sub r-up">
            Conferences, socials, simulations, and speaker nights.
          </p>
        </div>
      </section>

      <section className="page-section">
        <div className="inner">
          <div className="page-eyebrow r-up"><span className="bar" />Photo Gallery</div>
          <h2 className="r-up">Event photography</h2>

          {isLoading ? (
            <p className="lede r-up" role="status">Loading…</p>
          ) : loadError ? (
            <p className="lede r-up" role="alert" style={{ color: "var(--ink-soft)" }}>{loadError}</p>
          ) : images.length === 0 ? (
            <p className="lede r-up">
              Coming soon — we&apos;ll be adding event photos here shortly.
            </p>
          ) : (
            <>
              {categories.length > 0 && (
                <div className="gallery-tabs r-up" role="group" aria-label="Filter photos by category">
                  {[ALL, ...categories].map((category) => (
                    <button
                      key={category}
                      type="button"
                      className="gallery-tab"
                      aria-pressed={activeCategory === category}
                      onClick={() => selectCategory(category)}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              )}
              <div className="gallery-grid">
                {visibleImages.map((img, index) => (
                  <figure className="gallery-item" key={img.id}>
                    <button
                      type="button"
                      className="gallery-open"
                      onClick={() => setOpenIndex(index)}
                      aria-label={`View photo${img.caption ? `: ${img.caption}` : ""}`}
                    >
                      <img
                        src={img.image_url}
                        alt={img.caption ?? "MUTIS event photo"}
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {openIndex !== null && visibleImages[openIndex] && (
        <Lightbox
          images={visibleImages}
          index={openIndex}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      )}
    </>
  );
}

interface LightboxProps {
  images: GalleryImageRow[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

/** Full-screen viewer showing the whole photo (never cropped), with
 * previous/next through the photos in the current tab. */
function Lightbox({ images, index, onIndexChange, onClose }: LightboxProps) {
  const img = images[index];
  const count = images.length;
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);

  const step = useCallback(
    (delta: number) => onIndexChange((index + delta + count) % count),
    [index, count, onIndexChange]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && count > 1) step(-1);
      else if (e.key === "ArrowRight" && count > 1) step(1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, step, count]);

  // Lock page scroll while open and hand focus back to the photo that opened it.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus();
    };
  }, []);

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onClick={onClose}
      onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null || count < 2) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      }}
    >
      <button ref={closeRef} type="button" className="lightbox-btn lightbox-close" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>

      {count > 1 && (
        <>
          <button type="button" className="lightbox-btn lightbox-prev" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous photo">
            <ChevronLeft size={22} />
          </button>
          <button type="button" className="lightbox-btn lightbox-next" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next photo">
            <ChevronRight size={22} />
          </button>
        </>
      )}

      <figure className="lightbox-frame" onClick={(e) => e.stopPropagation()}>
        <img key={img.id} src={img.image_url} alt={img.caption ?? "MUTIS event photo"} />
        <figcaption>
          <span>{img.caption ?? ""}</span>
          {count > 1 && <span className="lightbox-count">{index + 1} / {count}</span>}
        </figcaption>
      </figure>
    </div>,
    document.body
  );
}
