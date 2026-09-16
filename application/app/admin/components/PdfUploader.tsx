import { useRef, useState, type DragEvent } from "react";
import { UploadCloud, FileText, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useToast } from "./Toast";
import { compressPdf, COMPRESS_THRESHOLD_BYTES, MAX_COMPRESS_INPUT_BYTES } from "../lib/compressPdf";

const DEFAULT_BUCKET = "meif_files";

export interface PdfUploadResult {
  path: string;
  fileSizeBytes: number;
}

interface PdfUploaderProps {
  bucket?: string;
  /** Client-side guard; keep in step with the bucket's file_size_limit. */
  maxBytes?: number;
  /** Shrink PDFs over 5MB in the browser (Ghostscript) before checking maxBytes and uploading. */
  compress?: boolean;
  currentPath?: string | null;
  currentFileSizeBytes?: number | null;
  onChange: (result: PdfUploadResult | null) => void;
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileNameFromPath(path: string) {
  return path.split("/").pop() ?? path;
}

/** Uploads immediately on drop/select (rather than waiting for the parent
 * form to submit) so the admin gets instant upload feedback, and previews
 * the PDF inline via the same native <object> embed as the public site's
 * DocumentViewer. Storage cleanup only ever touches files uploaded in this
 * session — the original saved file (if editing) is left alone unless the
 * form is actually saved, so cancelling never deletes a live document. */
export function PdfUploader({ bucket = DEFAULT_BUCKET, maxBytes, compress = false, currentPath, currentFileSizeBytes, onChange }: PdfUploaderProps) {
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [statusText, setStatusText] = useState("Uploading…");
  const [dragOver, setDragOver] = useState(false);
  const [path, setPath] = useState<string | null>(currentPath ?? null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(currentFileSizeBytes ?? null);

  const previewUrl = path ? supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl : null;

  const upload = async (original: File) => {
    if (original.type !== "application/pdf") {
      toast.error("Please choose a PDF file.");
      return;
    }
    const tooBigToCompress = original.size > MAX_COMPRESS_INPUT_BYTES;
    if (maxBytes != null && original.size > maxBytes && (!compress || tooBigToCompress)) {
      toast.error(
        compress
          ? `That PDF is ${formatBytes(original.size)} — too large to compress in the browser (max ${formatBytes(MAX_COMPRESS_INPUT_BYTES)}).`
          : `That PDF is ${formatBytes(original.size)} — the limit is ${formatBytes(maxBytes)}.`,
      );
      return;
    }
    setUploading(true);
    try {
      let file = original;
      let compressedNote = "";
      if (compress && original.size > COMPRESS_THRESHOLD_BYTES) {
        const result = await compressPdf(original, maxBytes ?? Infinity, (preset) =>
          setStatusText(preset === "/printer" ? `Compressing ${formatBytes(original.size)}…` : "Compressing further…"),
        );
        file = result.file;
        if (result.compressed) compressedNote = ` Compressed from ${formatBytes(result.originalBytes)} to ${formatBytes(file.size)}.`;
      }
      if (maxBytes != null && file.size > maxBytes) {
        throw new Error(
          file === original
            ? `That PDF is ${formatBytes(file.size)} and couldn't be compressed — the limit is ${formatBytes(maxBytes)}.`
            : `Even compressed, that PDF is ${formatBytes(file.size)} — the limit is ${formatBytes(maxBytes)}. Try splitting it or reducing its images.`,
        );
      }
      setStatusText(`Uploading ${formatBytes(file.size)}…`);
      const newPath = `${crypto.randomUUID()}.pdf`;
      const { error } = await supabase.storage.from(bucket).upload(newPath, file, { contentType: "application/pdf" });
      if (error) throw error;

      // Only clean up a same-session upload being replaced — never the
      // original file this component was opened with.
      if (path && path !== currentPath) {
        await supabase.storage.from(bucket).remove([path]);
      }

      setPath(newPath);
      setFileSizeBytes(file.size);
      onChange({ path: newPath, fileSizeBytes: file.size });
      toast.success(`PDF uploaded.${compressedNote}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
      setStatusText("Uploading…");
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) upload(file);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  const onRemove = async () => {
    if (path && path !== currentPath) {
      await supabase.storage.from(bucket).remove([path]);
    }
    setPath(null);
    setFileSizeBytes(null);
    onChange(null);
  };

  return (
    <div>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />

      {!previewUrl ? (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex flex-col items-center justify-center gap-[8px] rounded-[12px] border-2 border-dashed px-[24px] py-[36px] text-center transition-colors ${
            uploading ? "cursor-wait" : "cursor-pointer"
          } ${dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"}`}
        >
          {uploading ? (
            <Loader2 className="h-[22px] w-[22px] animate-spin text-muted-foreground" />
          ) : (
            <UploadCloud className="h-[22px] w-[22px] text-muted-foreground" />
          )}
          <p className="text-[13px]! font-medium text-foreground">
            {uploading ? statusText : "Drag & drop a PDF here, or click to browse"}
          </p>
          <p className="text-[12px] text-muted-foreground">PDF files only{maxBytes != null ? `, up to ${formatBytes(maxBytes)}` : ""}{compress ? " — large files are compressed automatically" : ""}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[12px] border border-border">
          <object data={previewUrl} type="application/pdf" className="h-[280px] w-full bg-input" aria-label="PDF preview">
            <div className="flex h-[280px] items-center justify-center bg-input px-[16px] text-center text-[13px] text-muted-foreground">
              Preview isn&apos;t available in this browser — the file uploaded fine.
            </div>
          </object>
          <div className="flex items-center justify-between gap-[8px] border-t border-border px-[14px] py-[10px]">
            <div className="flex min-w-0 items-center gap-[8px]">
              <FileText className="h-[14px] w-[14px] shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-[13px]! text-foreground">{fileNameFromPath(path!)}</p>
                {fileSizeBytes != null && <p className="text-[11px] text-muted-foreground">{formatBytes(fileSizeBytes)}</p>}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-[4px]">
              <button
                type="button"
                disabled={uploading}
                onClick={() => inputRef.current?.click()}
                className="rounded-[8px] px-[10px] py-[6px] text-[12px]! font-medium text-foreground transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                Replace
              </button>
              <button
                type="button"
                disabled={uploading}
                onClick={onRemove}
                title="Remove"
                className="rounded-[8px] p-[6px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                <X className="h-[14px] w-[14px]" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
