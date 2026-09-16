/// <reference lib="webworker" />
/**
 * Runs Ghostscript (WASM build of GhostPDL, AGPL-3.0 — see
 * @okathira/ghostpdl-wasm) off the main thread to shrink PDFs before upload.
 * Only admins ever load this: it's reached via a dynamic Worker in the
 * admin PdfUploader, and the ~15MB .wasm is fetched on first compression.
 */
import loadGhostscript from "@okathira/ghostpdl-wasm";
import wasmUrl from "@okathira/ghostpdl-wasm/gs.wasm?url";

export type CompressRequest = { input: ArrayBuffer; preset: "/printer" | "/ebook" };
export type CompressResponse = { ok: true; output: ArrayBuffer } | { ok: false; error: string };

let wasmBinary: Promise<ArrayBuffer> | null = null;

self.onmessage = async (event: MessageEvent<CompressRequest>) => {
  const { input, preset } = event.data;
  try {
    wasmBinary ??= fetch(wasmUrl).then((res) => {
      if (!res.ok) throw new Error(`Could not load the PDF compressor (${res.status}).`);
      return res.arrayBuffer();
    });
    // A fresh module per run: Emscripten programs aren't safe to callMain twice.
    const gs = await loadGhostscript({
      wasmBinary: await wasmBinary,
      print: () => {},
      printErr: () => {},
    });
    gs.FS.writeFile("in.pdf", new Uint8Array(input));
    const exitCode = gs.callMain([
      "-sDEVICE=pdfwrite",
      `-dPDFSETTINGS=${preset}`,
      "-dCompatibilityLevel=1.5",
      "-dDetectDuplicateImages=true",
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-sOutputFile=out.pdf",
      "in.pdf",
    ]);
    if (exitCode !== 0) throw new Error(`Ghostscript exited with code ${exitCode}.`);
    const output = gs.FS.readFile("out.pdf") as Uint8Array;
    const buffer = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
    self.postMessage({ ok: true, output: buffer } satisfies CompressResponse, [buffer]);
  } catch (err) {
    self.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) } satisfies CompressResponse);
  }
};
