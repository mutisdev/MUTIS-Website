import { useEffect, useState } from "react";
import type { Tables } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export type PodcastEpisode = Tables<"podcast_episodes">;

/** Published episodes in their admin-assigned slot order (slot 0 first). */
export function usePodcastEpisodes() {
  const [episodes, setEpisodes] = useState<PodcastEpisode[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("podcast_episodes")
      .select("*")
      .eq("is_published", true)
      // created_at breaks ties so two episodes sharing a slot still render in a
      // stable order rather than swapping between page loads.
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error("Failed to load podcast episodes", error);
        setEpisodes(data ?? []);
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { episodes, isLoading };
}
