import type { CompressRequest, CompressResponse } from "./pdfCompress.worker";

/** Files at or below this are uploaded as-is — not worth the compressor download. */
export const COMPRESS_THRESHOLD_BYTES = 5 * 1024 * 1024;
/** Larger inputs risk exhausting browser/WASM memory (input + output held at once). */
export const MAX_COMPRESS_INPUT_BYTES = 300 * 1024 * 1024;

export interface CompressResult {
  file: File;
  originalBytes: number;
  compressed: boolean;
}

function runPreset(input: ArrayBuffer, preset: CompressRequest["preset"]): Promise<ArrayBuffer> {
  // One worker per run, terminated afterwards, so the WASM heap is released.
  const worker = new Worker(new URL("./pdfCompress.worker.ts", import.meta.url), { type: "module" });
  return new Promise<ArrayBuffer>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<CompressResponse>) => {
      if (event.data.ok) resolve(event.data.output);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => reject(new Error(event.message || "The PDF compressor crashed."));
    worker.postMessage({ input, preset } satisfies CompressRequest);
  }).finally(() => worker.terminate());
}

/**
 * Shrinks a PDF with Ghostscript: first at 300 DPI (/printer) to keep charts
 * sharp when zoomed, then at 150 DPI (/ebook) only if the result is still over
 * `targetBytes`. Text and vector content stay selectable either way. Returns
 * the original file if compression fails or doesn't make it smaller — callers
 * enforce the size limit on whatever comes back.
 */
export async function compressPdf(file: File, targetBytes: number, onStage?: (preset: string) => void): Promise<CompressResult> {
  const unchanged: CompressResult = { file, originalBytes: file.size, compressed: false };
  if (file.size <= COMPRESS_THRESHOLD_BYTES || file.size > MAX_COMPRESS_INPUT_BYTES) return unchanged;

  let best: ArrayBuffer | null = null;
  for (const preset of ["/printer", "/ebook"] as const) {
    onStage?.(preset);
    try {
      // Each run transfers nothing back into `file`, so read a fresh copy per pass.
      const output = await runPreset(await file.arrayBuffer(), preset);
      if (output.byteLength < (best?.byteLength ?? file.size)) best = output;
    } catch (err) {
      console.error(`PDF compression (${preset}) failed`, err);
    }
    if (best && best.byteLength <= targetBytes) break;
  }

  if (!best) return unchanged;
  return { file: new File([best], file.name, { type: "application/pdf" }), originalBytes: file.size, compressed: true };
}
