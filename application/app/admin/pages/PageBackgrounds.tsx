import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { UrlColumnImageUploader } from "../components/ImageUploader";
import { usePageCache, hasCached } from "../usePageCache";

type PageBackground = Database["public"]["Tables"]["page_backgrounds"]["Row"];

const PAGES: { key: string; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "about", label: "About" },
  { key: "previous-presidents", label: "Previous Presidents" },
  { key: "network", label: "Our Network" },
  { key: "events", label: "Events" },
  { key: "past-speakers", label: "Past Speakers" },
  { key: "meif", label: "MEIF" },
  { key: "wif", label: "WIF" },
  { key: "articles", label: "Articles" },
  { key: "sponsors", label: "Sponsors" },
  { key: "media", label: "Media" },
  { key: "gallery", label: "Gallery" },
  { key: "recordings", label: "Recordings" },
  { key: "contact", label: "Contact" },
  { key: "team", label: "Team" },
  { key: "join", label: "Join" },
];

export function PageBackgrounds() {
  const toast = useToast();
  const [rows, setRows] = usePageCache<Record<string, PageBackground>>("admin:page-backgrounds:rows", {});
  const [loading, setLoading] = useState(!hasCached("admin:page-backgrounds:rows"));

  const fetchRows = async () => {
    const { data, error } = await supabase.from("page_backgrounds").select("*");
    if (error) {
      toast.error("Could not load page backgrounds.");
    } else {
      const map: Record<string, PageBackground> = {};
      for (const row of data ?? []) map[row.page_key] = row;
      setRows(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setImage = async (pageKey: string, imageUrl: string) => {
    const { data, error } = await supabase
      .from("page_backgrounds")
      .update({ image_url: imageUrl || null })
      .eq("page_key", pageKey)
      .select()
      .single();
    if (error) {
      toast.error("Could not update that page's background.");
      return;
    }
    setRows((prev) => ({ ...prev, [pageKey]: data }));
    toast.success(imageUrl ? "Background updated." : "Reset to default.");
  };

  return (
    <div className="mx-auto max-w-[720px] px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Content</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Page backgrounds</h1>
      <p className="mt-[8px] text-[13px] leading-[1.6] text-muted-foreground">
        Upload a photo to override a page's default hero background. Pages left unset keep their
        current look (the standard gradient, or their existing photo for Events/Home).
      </p>

      {loading ? (
        <div className="mt-[32px] flex items-center justify-center py-[48px] text-muted-foreground">
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
        </div>
      ) : (
        <div className="mt-[24px] flex flex-col gap-[16px]">
          {PAGES.map((p) => {
            const row = rows[p.key];
            return (
              <div key={p.key} className="flex items-center gap-[16px] rounded-[14px] border border-border bg-card p-[16px]">
                <UrlColumnImageUploader
                  bucket="page_background_images"
                  currentUrl={row?.image_url ?? ""}
                  aspect="banner"
                  onUploaded={(url) => setImage(p.key, url)}
                />
                <span className="text-[14px] font-medium text-foreground">{p.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
