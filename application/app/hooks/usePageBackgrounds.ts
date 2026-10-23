import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { parseCrop, type HeroCrop } from "@/app/lib/heroCrop";

export interface PageBackground {
  src: string | null;
  crop: HeroCrop | null;
}

const NONE: PageBackground = { src: null, crop: null };

let cache: Record<string, PageBackground> | null = null;
let inflight: Promise<void> | null = null;

async function loadPageBackgrounds(): Promise<Record<string, PageBackground>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const { data, error } = await supabase.from("page_backgrounds").select("*");
      if (error) console.error("Failed to load page backgrounds", error);
      const map: Record<string, PageBackground> = {};
      for (const row of data ?? []) {
        map[row.page_key] = {
          src: row.image_url,
          // parseCrop rejects anything that isn't a usable selection, so a row saved before
          // cropping existed, or a hand-edited bad value, simply means no crop.
          crop: parseCrop(row.crop),
        };
      }
      cache = map;
    })();
  }
  await inflight;
  return cache ?? {};
}

/** The admin-uploaded photo for one navbar page (or "home") and the crop chosen for it,
 * falling back to that page's default look (its CSS gradient, or a hardcoded photo like
 * Events' eventsbg.jpg) when nothing has been set. */
export function usePageBackground(pageKey: string): PageBackground {
  const [background, setBackground] = useState<PageBackground>(cache?.[pageKey] ?? NONE);

  useEffect(() => {
    let cancelled = false;
    loadPageBackgrounds().then((map) => {
      if (!cancelled) setBackground(map[pageKey] ?? NONE);
    });
    return () => {
      cancelled = true;
    };
  }, [pageKey]);

  return background;
}
