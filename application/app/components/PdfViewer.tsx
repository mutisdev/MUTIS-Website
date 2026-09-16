import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Download, Loader2, Minus, Plus } from "lucide-react";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export interface PdfViewerProps {
  url: string;
  title: string;
  /** "inline" sits in the page flow (article detail); "modal" fills a dialog body. */
  variant?: "inline" | "modal";
  /** Frame height in px. Inline defaults to min(85vh, 960px). */
  height?: number;
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3];
const MAX_FIT_WIDTH = 900;
const FRAME_PADDING = 16;
const PAGE_GAP = 16;
const THUMB_WIDTH = 96;
/** Sidebar column: thumb + 12px padding each side + 1px border. */
const THUMBS_COLUMN_WIDTH = THUMB_WIDTH + 25;
/** Room for the frame's vertical scrollbar so 100% never overflows sideways. */
const SCROLLBAR_ALLOWANCE = 16;
const THUMBS_MIN_PAGES = 6;
const THUMBS_MIN_VIEWER_WIDTH = 720;
const COMPACT_MAX_VIEWER_WIDTH = 560;

/** Supabase public URLs accept ?download=<name> to force Content-Disposition:
 * attachment — the <a download> attribute alone is ignored cross-origin. */
function downloadHref(url: string, title: string) {
  if (!url.includes("/storage/v1/object/public/")) return url;
  const name = `${title.replace(/[^\w\- ]+/g, "").trim() || "document"}.pdf`;
  return `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(name)}`;
}

function useElementWidth(ref: RefObject<HTMLElement | null>) {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** True once the element is within `margin` of its scroll root. Pages
 * unmount again when scrolled far away so long PDFs don't hold every canvas. */
function useNearViewport(ref: RefObject<HTMLElement | null>, root: RefObject<HTMLElement | null>, margin: string) {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), {
      root: root.current,
      rootMargin: margin,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, root, margin]);
  return near;
}

function LazyPage({
  pageNumber,
  width,
  aspect,
  frameRef,
  slotRef,
}: {
  pageNumber: number;
  width: number;
  aspect: number;
  frameRef: RefObject<HTMLDivElement | null>;
  slotRef: (el: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const near = useNearViewport(ref, frameRef, "100% 0px");
  return (
    <div
      ref={(el) => {
        ref.current = el;
        slotRef(el);
      }}
      className="pdf-viewer-page"
      style={{ width, height: Math.round(width * aspect) }}
      data-page={pageNumber}
    >
      {near ? (
        <Page pageNumber={pageNumber} width={width} loading="" renderTextLayer renderAnnotationLayer />
      ) : null}
    </div>
  );
}

function LazyThumb({
  pageNumber,
  aspect,
  active,
  rootRef,
  onSelect,
}: {
  pageNumber: number;
  aspect: number;
  active: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
  onSelect: (page: number) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const near = useNearViewport(ref, rootRef, "200px 0px");
  return (
    <button
      ref={ref}
      type="button"
      className={`pdf-viewer-thumb${active ? " is-active" : ""}`}
      onClick={() => onSelect(pageNumber)}
      aria-label={`Go to page ${pageNumber}`}
      aria-current={active ? "page" : undefined}
      data-thumb={pageNumber}
    >
      <span className="pdf-viewer-thumb-canvas" style={{ width: THUMB_WIDTH, height: Math.round(THUMB_WIDTH * aspect) }}>
        {near ? (
          <Page pageNumber={pageNumber} width={THUMB_WIDTH} loading="" renderTextLayer={false} renderAnnotationLayer={false} />
        ) : null}
      </span>
      <span className="pdf-viewer-thumb-label">{pageNumber}</span>
    </button>
  );
}

export default function PdfViewer({ url, title, variant = "inline", height }: PdfViewerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  // Mirrored into state so the scroll listener attaches whenever <Document> actually mounts the frame.
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const attachFrame = useCallback((el: HTMLDivElement | null) => {
    frameRef.current = el;
    setFrameEl(el);
  }, []);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [numPages, setNumPages] = useState(0);
  const [aspects, setAspects] = useState<number[]>([]);
  const [failed, setFailed] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [zoomIndex, setZoomIndex] = useState(ZOOM_STEPS.indexOf(1));

  const viewerWidth = useElementWidth(rootRef);
  const compact = viewerWidth > 0 && viewerWidth < COMPACT_MAX_VIEWER_WIDTH;
  const showThumbs = numPages >= THUMBS_MIN_PAGES && viewerWidth >= THUMBS_MIN_VIEWER_WIDTH;

  const zoom = compact ? 1 : ZOOM_STEPS[zoomIndex];
  // Measured from the always-mounted root: the frame itself only mounts once the document loads.
  const frameWidth = viewerWidth - (showThumbs ? THUMBS_COLUMN_WIDTH : 0) - 2;
  const fitWidth = Math.max(0, Math.min(frameWidth - FRAME_PADDING * 2 - SCROLLBAR_ALLOWANCE, MAX_FIT_WIDTH));
  const pageWidth = Math.floor(fitWidth * zoom);

  const onLoadSuccess = useCallback(async (pdf: PDFDocumentProxy) => {
    setNumPages(pdf.numPages);
    setCurrentPage(1);
    setPageInput("1");
    // Page viewports only parse page dictionaries (no rendering), so sizing
    // every placeholder up front is cheap and avoids layout shift on scroll.
    const ratios = await Promise.all(
      Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const { width, height: h } = page.getViewport({ scale: 1 });
        return h / width;
      }),
    );
    setAspects(ratios);
  }, []);

  const aspectFor = (page: number) => aspects[page - 1] ?? aspects[0] ?? Math.SQRT2;

  const scrollToPage = useCallback((page: number, behavior: ScrollBehavior = "smooth") => {
    const frame = frameRef.current;
    const slot = slotRefs.current[page - 1];
    if (!frame || !slot) return;
    // Scroll the frame directly — scrollIntoView would also scroll the window.
    frame.scrollTo({ top: slot.offsetTop - FRAME_PADDING, behavior });
  }, []);

  const goToPage = (page: number) => {
    const clamped = Math.min(Math.max(1, page), numPages || 1);
    setCurrentPage(clamped);
    setPageInput(String(clamped));
    scrollToPage(clamped);
  };

  // Track the page whose slot crosses the upper third of the frame.
  useEffect(() => {
    const frame = frameEl;
    if (!frame || !numPages) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const marker = frame.scrollTop + frame.clientHeight / 3;
        let page = 1;
        for (let i = 0; i < slotRefs.current.length; i++) {
          const slot = slotRefs.current[i];
          if (slot && slot.offsetTop <= marker) page = i + 1;
          else break;
        }
        setCurrentPage(page);
        setPageInput((prev) => (document.activeElement?.classList.contains("pdf-viewer-page-input") ? prev : String(page)));
      });
    };
    frame.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      frame.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [frameEl, numPages]);

  // Keep the current page in view when zoom changes the layout height.
  const pageBeforeZoom = useRef(currentPage);
  pageBeforeZoom.current = currentPage;
  useLayoutEffect(() => {
    scrollToPage(pageBeforeZoom.current, "auto");
  }, [zoom, scrollToPage]);

  // Keep the active thumbnail visible inside the sidebar.
  useEffect(() => {
    const sidebar = thumbsRef.current;
    const thumb = sidebar?.querySelector<HTMLElement>(`[data-thumb="${currentPage}"]`);
    if (!sidebar || !thumb) return;
    const top = thumb.offsetTop;
    const bottom = top + thumb.offsetHeight;
    if (top < sidebar.scrollTop || bottom > sidebar.scrollTop + sidebar.clientHeight) {
      sidebar.scrollTo({ top: top - sidebar.clientHeight / 2 + thumb.offsetHeight / 2, behavior: "smooth" });
    }
  }, [currentPage, showThumbs]);

  const frameHeight = height ?? (variant === "inline" ? "min(85vh, 960px)" : 480);
  const download = downloadHref(url, title);

  if (failed) {
    return (
      <div className="pdf-viewer pdf-viewer-failed">
        <p>
          This PDF couldn&apos;t be displayed.{" "}
          <a href={url} target="_blank" rel="noreferrer">Open {title} in a new tab</a>.
        </p>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`pdf-viewer pdf-viewer--${variant}${compact ? " is-compact" : ""}`}>
      <div className="pdf-viewer-toolbar" role="toolbar" aria-label={`${title} controls`}>
        <div className="pdf-viewer-group">
          <button type="button" className="pdf-viewer-btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
            <ChevronLeft size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <form
            className="pdf-viewer-pager"
            onSubmit={(e) => {
              e.preventDefault();
              goToPage(Number(pageInput) || currentPage);
              (document.activeElement as HTMLElement | null)?.blur();
            }}
          >
            <input
              className="pdf-viewer-page-input"
              type="text"
              inputMode="numeric"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
              onBlur={() => goToPage(Number(pageInput) || currentPage)}
              aria-label="Page number"
              disabled={!numPages}
            />
            <span className="pdf-viewer-page-total">/ {numPages || "–"}</span>
          </form>
          <button type="button" className="pdf-viewer-btn" onClick={() => goToPage(currentPage + 1)} disabled={!numPages || currentPage >= numPages} aria-label="Next page">
            <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        {!compact && (
          <div className="pdf-viewer-group">
            <button type="button" className="pdf-viewer-btn" onClick={() => setZoomIndex((i) => Math.max(0, i - 1))} disabled={zoomIndex === 0} aria-label="Zoom out">
              <Minus size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
            <span className="pdf-viewer-zoom" aria-live="polite">{Math.round(zoom * 100)}%</span>
            <button type="button" className="pdf-viewer-btn" onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))} disabled={zoomIndex === ZOOM_STEPS.length - 1} aria-label="Zoom in">
              <Plus size={16} strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        )}

        <a href={download} download target="_blank" rel="noreferrer" className="pdf-viewer-btn pdf-viewer-download">
          <Download size={15} strokeWidth={1.8} aria-hidden="true" />
          {!compact && <span>Download</span>}
          {compact && <span className="sr-only">Download {title}</span>}
        </a>
      </div>

      <Document
        file={url}
        onLoadSuccess={onLoadSuccess}
        onLoadError={() => setFailed(true)}
        loading={
          <div className="pdf-viewer-status" style={{ height: frameHeight }}>
            <Loader2 size={20} className="pdf-viewer-spin" aria-hidden="true" />
            <span>Loading PDF…</span>
          </div>
        }
        className="pdf-viewer-body"
      >
        {showThumbs && (
          <div ref={thumbsRef} className="pdf-viewer-thumbs" style={{ height: frameHeight, width: THUMBS_COLUMN_WIDTH }} aria-label="Page thumbnails">
            {Array.from({ length: numPages }, (_, i) => (
              <LazyThumb key={i} pageNumber={i + 1} aspect={aspectFor(i + 1)} active={currentPage === i + 1} rootRef={thumbsRef} onSelect={goToPage} />
            ))}
          </div>
        )}
        <div ref={attachFrame} className="pdf-viewer-frame" style={{ height: frameHeight, padding: FRAME_PADDING, gap: PAGE_GAP }} tabIndex={0} aria-label={title}>
          {pageWidth > 0 &&
            Array.from({ length: numPages }, (_, i) => (
              <LazyPage
                key={i}
                pageNumber={i + 1}
                width={pageWidth}
                aspect={aspectFor(i + 1)}
                frameRef={frameRef}
                slotRef={(el) => {
                  slotRefs.current[i] = el;
                }}
              />
            ))}
        </div>
      </Document>
    </div>
  );
}
