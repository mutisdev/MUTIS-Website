import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import type { PdfViewerProps } from "./PdfViewer";

/**
 * pdf.js (react-pdf + its worker) is around 1MB, so the viewer is split into
 * its own chunk and only fetched when a page actually shows a PDF. Public
 * routes are imported eagerly, so this lazy boundary is what keeps it out of
 * the main bundle.
 */
const PdfViewer = lazy(() => import("./PdfViewer"));

export function DocumentViewer(props: PdfViewerProps) {
  const height = props.height ?? (props.variant === "modal" ? 480 : "min(85vh, 960px)");
  return (
    <Suspense
      fallback={
        <div className="pdf-viewer">
          <div className="pdf-viewer-status" style={{ height }}>
            <Loader2 size={20} className="pdf-viewer-spin" aria-hidden="true" />
            <span>Loading viewer…</span>
          </div>
        </div>
      }
    >
      <PdfViewer {...props} />
    </Suspense>
  );
}
