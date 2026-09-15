import { useRef, useState } from "react";
import { ImageOff, Upload, Loader2, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "./Toast";
import { ConfirmDialog } from "./ConfirmDialog";

export type StorageBucket =
  | "sponsor_logos"
  | "committee_photos"
  | "event_photos"
  | "alumni_photos"
  | "article_covers"
  | "president_photos"
  | "gallery_photos"
  | "speaker_photos"
  | "fund_manager_photos"
  | "network_logos"
  | "page_background_images";

type Aspect = "square" | "contain" | "banner";

/** Formats every browser renders natively, so they can be stored as-is. HEIC/AVIF/etc.
 * still go through the canvas to be converted into something universally displayable. */
const PASSTHROUGH_TYPES = ["image/jpeg", "image/png", "image/webp"];
/** Above this, re-encode even when no crop/resize is needed — passthrough skips all
 * compression, and the storage buckets have no size limit of their own. */
const PASSTHROUGH_MAX_BYTES = 2_000_000;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image file."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Resizes/crops client-side via canvas. SVGs are passed through untouched
 * (vector, and canvas rasterisation would defeat the point of an SVG logo).
 */
async function processImage(
  file: File,
  { forceJpeg, aspect, maxWidth }: { forceJpeg: boolean; aspect: Aspect; maxWidth: number }
): Promise<{ blob: Blob; contentType: string; ext: string }> {
  if (file.type === "image/svg+xml" && !forceJpeg) {
    return { blob: file, contentType: file.type, ext: "svg" };
  }

  const img = await loadImage(file);

  // Nothing to crop or downscale: keep the user's exact bytes rather than losing
  // quality (and EXIF/ICC) to a pointless canvas round-trip.
  if (
    !forceJpeg &&
    aspect === "contain" &&
    img.width <= maxWidth &&
    file.size <= PASSTHROUGH_MAX_BYTES &&
    PASSTHROUGH_TYPES.includes(file.type)
  ) {
    return { blob: file, contentType: file.type, ext: file.type.split("/")[1] };
  }

  const canvas = document.createElement("canvas");

  let sx = 0;
  let sy = 0;
  let sWidth = img.width;
  let sHeight = img.height;

  if (aspect === "square") {
    const side = Math.min(img.width, img.height);
    sx = (img.width - side) / 2;
    sy = (img.height - side) / 2;
    sWidth = side;
    sHeight = side;
    canvas.width = Math.min(side, maxWidth);
    canvas.height = canvas.width;
  } else if (aspect === "banner") {
    const targetRatio = 16 / 9;
    const currentRatio = img.width / img.height;
    if (currentRatio > targetRatio) {
      sHeight = img.height;
      sWidth = sHeight * targetRatio;
      sx = (img.width - sWidth) / 2;
    } else {
      sWidth = img.width;
      sHeight = sWidth / targetRatio;
      sy = (img.height - sHeight) / 2;
    }
    canvas.width = Math.min(sWidth, maxWidth);
    canvas.height = canvas.width / targetRatio;
  } else {
    const scale = Math.min(1, maxWidth / img.width);
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported in this browser.");
  ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

  const contentType = forceJpeg ? "image/jpeg" : file.type === "image/png" || file.type === "image/webp" ? file.type : "image/jpeg";
  const ext = contentType.split("/")[1];

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, contentType, 0.88));
  if (!blob) throw new Error("Could not process that image.");
  return { blob, contentType, ext };
}

/** Programmatic upload for callers that don't render a full uploader widget
 * (e.g. inserting an inline image at the editor's cursor position). Follows
 * the same client-side resize + Supabase Storage pattern as UrlColumnImageUploader. */
export async function uploadImage(
  bucket: StorageBucket,
  file: File,
  { aspect = "contain", maxWidth = 1600 }: { aspect?: Aspect; maxWidth?: number } = {}
): Promise<string> {
  const { blob, contentType, ext } = await processImage(file, { forceJpeg: false, aspect, maxWidth });
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: false, contentType });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** Recovers the storage path (e.g. `abc123.jpg`) from a Supabase public URL, so a
 * previously-uploaded file can be deleted. Returns null for URLs outside this bucket
 * (e.g. an externally pasted image URL), which just aren't ours to delete. */
function bucketObjectPath(bucket: string, url: string): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length).split("?")[0];
}

function Thumb({ url, aspect }: { url: string | null | undefined; aspect: Aspect }) {
  const shapeClass =
    aspect === "square" ? "aspect-square rounded-[10px]" : aspect === "banner" ? "aspect-video rounded-[10px]" : "aspect-square rounded-[10px]";
  return (
    <div className={`flex w-[96px] shrink-0 items-center justify-center overflow-hidden border border-border bg-input ${shapeClass}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className={aspect === "contain" ? "max-h-full max-w-full object-contain p-[8px]" : "h-full w-full object-cover"} />
      ) : (
        <ImageOff className="h-[20px] w-[20px] text-muted-foreground" />
      )}
    </div>
  );
}

interface IdKeyedProps {
  bucket: StorageBucket;
  id: string;
  currentUrl?: string | null;
  onUploaded: (publicUrl: string) => void;
  aspect?: Aspect;
}

/** For committee/alumni/presidents: the public URL is always `{bucket}/{id}.jpeg`, so this
 * requires the row to already exist and always forces JPEG + a square crop. */
export function IdKeyedImageUploader({ bucket, id, currentUrl, onUploaded, aspect = "square" }: IdKeyedProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null | undefined>(currentUrl);

  const onDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      const path = `${id}.jpeg`;
      const { error } = await supabase.storage.from(bucket).remove([path]);
      if (error) throw error;
      const { error: purgeError } = await supabase.functions.invoke("purge-storage-cache", { body: { bucket, path } });
      if (purgeError) console.error("Failed to purge CDN cache for", bucket, path, purgeError);
      setPreviewUrl(null);
      onUploaded("");
      toast.success("Photo removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that photo.");
    } finally {
      setDeleting(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { blob, contentType } = await processImage(file, { forceJpeg: true, aspect, maxWidth: 800 });
      const path = `${id}.jpeg`;
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true, contentType, cacheControl: "0" });
      if (error) throw error;
      // This path (`{id}.jpeg`) is immutable at the storage CDN's edge cache, so overwriting it
      // on reupload doesn't invalidate what the CDN already served for that path — viewers (and
      // the admin UI itself) keep getting the previous image until it's explicitly purged.
      // Purging requires the service_role key, so it happens server-side via this function.
      const { error: purgeError } = await supabase.functions.invoke("purge-storage-cache", { body: { bucket, path } });
      if (purgeError) console.error("Failed to purge CDN cache for", bucket, path, purgeError);
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      const bustedUrl = `${data.publicUrl}?t=${Date.now()}`;
      setPreviewUrl(bustedUrl);
      onUploaded(data.publicUrl);
      toast.success("Photo uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-[16px]">
      <Thumb url={previewUrl} aspect={aspect} />
      <div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            disabled={uploading || deleting}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-[6px] rounded-[10px] border border-border px-[14px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Upload className="h-[14px] w-[14px]" />}
            {uploading ? "Uploading…" : "Upload photo"}
          </button>
          {previewUrl && (
            <button
              type="button"
              disabled={uploading || deleting}
              onClick={() => setConfirmOpen(true)}
              title="Remove photo"
              className="inline-flex items-center justify-center rounded-[10px] border border-border p-[10px] text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Trash2 className="h-[14px] w-[14px]" />}
            </button>
          )}
        </div>
        <p className="mt-[6px] text-[12px] text-muted-foreground">JPEG, square crop, converted automatically.</p>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Remove photo?"
        description="This deletes the photo from storage. You can upload a new one at any time."
        confirmLabel="Remove"
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

interface UrlColumnProps {
  bucket: StorageBucket;
  currentUrl?: string | null;
  onUploaded: (publicUrl: string) => void;
  aspect?: Aspect;
  maxWidth?: number;
}

/** For sponsors/events/articles: order-independent, writes the returned public URL into a
 * form field (`logo_url` / `cover_image_url`). Keeps original format so transparency survives. */
export function UrlColumnImageUploader({ bucket, currentUrl, onUploaded, aspect = "contain", maxWidth = 1600 }: UrlColumnProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null | undefined>(currentUrl);

  const onDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      // Each upload here gets a fresh random filename, so unlike the ID-keyed uploader
      // there's no stale-cache concern — a plain delete (no purge) is enough. Pasted
      // external URLs won't match this bucket's path and are just cleared, not deleted.
      const path = previewUrl ? bucketObjectPath(bucket, previewUrl) : null;
      if (path) {
        const { error } = await supabase.storage.from(bucket).remove([path]);
        if (error) throw error;
      }
      setPreviewUrl(null);
      onUploaded("");
      toast.success("Image removed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove that image.");
    } finally {
      setDeleting(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { blob, contentType, ext } = await processImage(file, { forceJpeg: false, aspect, maxWidth });
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { upsert: false, contentType });
      if (error) throw error;
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      setPreviewUrl(data.publicUrl);
      onUploaded(data.publicUrl);
      toast.success("Image uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex items-center gap-[16px]">
      <Thumb url={previewUrl} aspect={aspect} />
      <div>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        <div className="flex items-center gap-[8px]">
          <button
            type="button"
            disabled={uploading || deleting}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center gap-[6px] rounded-[10px] border border-border px-[14px] py-[10px] text-[13px]! font-medium text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Upload className="h-[14px] w-[14px]" />}
            {uploading ? "Uploading…" : "Upload image"}
          </button>
          {previewUrl && (
            <button
              type="button"
              disabled={uploading || deleting}
              onClick={() => setConfirmOpen(true)}
              title="Remove image"
              className="inline-flex items-center justify-center rounded-[10px] border border-border p-[10px] text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              {deleting ? <Loader2 className="h-[14px] w-[14px] animate-spin" /> : <Trash2 className="h-[14px] w-[14px]" />}
            </button>
          )}
        </div>
        <p className="mt-[6px] text-[12px] text-muted-foreground">Or paste a URL directly into the field below.</p>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        title="Remove image?"
        description="This clears the image and, if it was uploaded here, deletes it from storage."
        confirmLabel="Remove"
        destructive
        onConfirm={onDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
