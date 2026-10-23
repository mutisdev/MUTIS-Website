import { useEffect, useState } from "react";
import { Crop as CropIcon, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database.types";
import { useToast } from "../components/Toast";
import { UrlColumnImageUploader } from "../components/ImageUploader";
import { ImageCropper } from "../components/ImageCropper";
import { parseCrop, type HeroCrop } from "@/app/lib/heroCrop";
import { usePageCache, hasCached } from "../usePageCache";

type PageBackground = Database["public"]["Tables"]["page_backgrounds"]["Row"];
type PageBackgroundUpdate = Database["public"]["Tables"]["page_backgrounds"]["Update"];

const PAGES: { key: string; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "about", label: "About" },
  { key: "previous-presidents", label: "Previous Presidents" },
  { key: "network", label: "Our Network" },
  { key: "events", label: "Events" },
  { key: "opportunities", label: "Opportunities" },
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

  // Which row's cropper is open, and whether its save is in flight.
  const [cropping, setCropping] = useState<string | null>(null);
  const [savingCrop, setSavingCrop] = useState(false);

  const writeRow = async (pageKey: string, patch: PageBackgroundUpdate) => {
    const { data, error } = await supabase
      .from("page_backgrounds")
      .update(patch)
      .eq("page_key", pageKey)
      .select()
      .single();
    if (error || !data) return null;
    setRows((prev) => ({ ...prev, [pageKey]: data }));
    return data;
  };

  const setImage = async (pageKey: string, imageUrl: string) => {
    // A new photo invalidates any crop: those coordinates described the old one.
    const data = await writeRow(pageKey, { image_url: imageUrl || null, crop: null });
    if (!data) {
      toast.error("Could not update that page's background.");
      return;
    }
    toast.success(imageUrl ? "Background updated." : "Reset to default.");
    // Cropping is the natural next step once a photo lands.
    if (imageUrl) setCropping(pageKey);
  };

  const saveCrop = async (pageKey: string, crop: HeroCrop | null) => {
    setSavingCrop(true);
    const data = await writeRow(pageKey, { crop });
    setSavingCrop(false);
    if (!data) {
      toast.error("Could not save that crop.");
      return;
    }
    setCropping(null);
    toast.success(crop ? "Crop saved." : "Showing the whole image.");
  };

  return (
    <div className="mx-auto max-w-[720px] px-[24px] py-[48px] lg:px-[40px] lg:py-[56px]">
      <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">Content</p>
      <h1 className="mt-[8px] text-[22px] font-medium text-foreground">Page backgrounds</h1>
      <p className="mt-[8px] text-[13px] leading-[1.6] text-muted-foreground">
        Upload a photo to override a page's default hero background, then choose which part of
        it the banner shows. Pages left unset keep their current look (the standard gradient,
        or their existing photo for Events/Home).
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
                  aspect="contain"
                  maxWidth={2000}
                  onUploaded={(url) => setImage(p.key, url)}
                />
                <span className="flex-1 text-[14px] font-medium text-foreground">{p.label}</span>
                {row?.image_url && (
                  <button
                    type="button"
                    onClick={() => setCropping(p.key)}
                    className="inline-flex shrink-0 items-center gap-[6px] rounded-[10px] border border-border px-[12px] py-[8px] text-[12px] font-medium text-foreground transition-colors hover:bg-white/5"
                  >
                    <CropIcon className="h-[13px] w-[13px]" />
                    {parseCrop(row.crop) ? "Edit crop" : "Choose crop"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {cropping && rows[cropping]?.image_url && (
        <ImageCropper
          open
          src={rows[cropping]!.image_url!}
          initialCrop={parseCrop(rows[cropping]!.crop)}
          saving={savingCrop}
          onSave={(crop) => saveCrop(cropping, crop)}
          onClose={() => setCropping(null)}
        />
      )}
    </div>
  );
}
