import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";

let cache: Record<string, string | null> | null = null;
let inflight: Promise<void> | null = null;

async function loadPageBackgrounds(): Promise<Record<string, string | null>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase.from("page_backgrounds").select("*");
      if (error) console.error("Failed to load page backgrounds", error);
      const map: Record<string, string | null> = {};
      for (const row of data ?? []) map[row.page_key] = row.image_url;
      cache = map;
    })();
  }
  await inflight;
  return cache ?? {};
}

/** Admin-uploaded background image for one navbar page (or "home"), falling
 * back to that page's default look (its CSS gradient, or a hardcoded photo
 * like Events' eventsbg.jpg) when nothing has been set. */
export function usePageBackgroundImage(pageKey: string): string | null {
  const [image, setImage] = useState<string | null>(cache?.[pageKey] ?? null);

  useEffect(() => {
    let cancelled = false;
    loadPageBackgrounds().then((map) => {
      if (!cancelled) setImage(map[pageKey] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  return image;
}

/**
 * Inline style override for a `.page-hero` section: the same dark-overlay
 * recipe already used for Events' photographic hero (`.page-hero-events` in
 * mutis-subpage.css), reused here so every page gets legible text over its
 * custom photo. Returns undefined when no image is set, leaving the page's
 * existing CSS-class background (gradient or hardcoded photo) untouched.
 */
export function heroBackgroundStyle(imageUrl: string | null): CSSProperties | undefined {
  if (!imageUrl) return undefined;
  return {
    backgroundImage: `linear-gradient(180deg, rgba(2,5,13,0.55) 0%, rgba(2,5,13,0.88) 100%), url(${imageUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center 42%",
  };
}
