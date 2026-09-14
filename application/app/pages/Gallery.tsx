import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useReveal } from "@/app/hooks/useReveal";
import { usePageBackgroundImage, heroBackgroundStyle } from "@/app/hooks/usePageBackgrounds";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type GalleryImageRow = Tables<"gallery_images">;

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
            <h1 className="page-title r-up">Moments from<br />the <span className="accent">MUTIS year</span></h1>
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
            <div className="gallery-grid r-up">
              {images.map((img) => (
                <figure className="gallery-item" key={img.id}>
                  <img
                    src={img.image_url}
                    alt={img.caption ?? "MUTIS event photo"}
                    loading="lazy"
                    decoding="async"
                  />
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
