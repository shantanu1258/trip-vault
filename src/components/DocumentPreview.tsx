import { ChevronLeft, ChevronRight, FileWarning, Loader2, Minus, Plus, Scan } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const PDF_JS_MODULE_PATH = "/vendor/pdfjs/pdf.mjs";
const PDF_JS_WORKER_PATH = "/vendor/pdfjs/pdf.worker.mjs";

type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfPage = {
  getViewport: (input: { scale: number }) => PdfViewport;
  render: (input: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask;
  cleanup?: () => void;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};
type PdfLoadingTask = { promise: Promise<PdfDocument>; destroy?: () => Promise<void> | void };
export type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (input: { data: Uint8Array }) => PdfLoadingTask;
};
export type PdfModuleLoader = () => Promise<PdfJsModule>;

function ensurePromiseWithResolvers() {
  type Capability<T> = { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void };
  const compatiblePromise = Promise as PromiseConstructor & { withResolvers?: <T>() => Capability<T> };
  if (compatiblePromise.withResolvers) return;
  compatiblePromise.withResolvers = <T,>() => {
    let resolve!: Capability<T>["resolve"];
    let reject!: Capability<T>["reject"];
    const promise = new Promise<T>((nextResolve, nextReject) => { resolve = nextResolve; reject = nextReject; });
    return { promise, resolve, reject };
  };
}

export async function loadPdfJs(): Promise<PdfJsModule> {
  // PDF.js 6 uses this small ES2024 helper. Keep the viewer working on older
  // installed-PWA browser engines while the native Open action remains fallback.
  ensurePromiseWithResolvers();
  return import(/* @vite-ignore */ PDF_JS_MODULE_PATH) as Promise<PdfJsModule>;
}

export function documentPreviewKind(mimeType: string, filename: string) {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedName = filename.toLowerCase();
  if (normalizedMime === "application/pdf" || normalizedName.endsWith(".pdf")) return "pdf" as const;
  if (normalizedMime.startsWith("image/") || /\.(?:jpe?g|png|webp)$/.test(normalizedName)) return "image" as const;
  return "unsupported" as const;
}

export function DocumentPreview({ blob, url, title, mimeType, filename, pdfModuleLoader = loadPdfJs }: { blob: Blob; url: string; title: string; mimeType: string; filename: string; pdfModuleLoader?: PdfModuleLoader }) {
  const kind = documentPreviewKind(mimeType || blob.type, filename);
  if (kind === "pdf") return <PdfCanvasViewer blob={blob} title={title} pdfModuleLoader={pdfModuleLoader} />;
  if (kind === "image") return <ImageViewer url={url} title={title} />;
  return <div className="grid min-h-[62dvh] place-items-center p-8 text-center sm:min-h-[70dvh]"><div><FileWarning className="mx-auto size-8 text-warning" /><p className="mt-4 max-w-md text-sm font-bold">This file type cannot be previewed here. Use Open to view it with your device.</p></div></div>;
}

function ViewerToolbar({ zoom, onZoomOut, onZoomIn, onFit, children }: { zoom: number; onZoomOut: () => void; onZoomIn: () => void; onFit: () => void; children?: React.ReactNode }) {
  return <div className="sticky top-0 z-10 flex min-h-14 flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/95 px-2 py-2 shadow-soft backdrop-blur sm:px-3">
    <div className="flex items-center gap-1">{children}</div>
    <div className="flex items-center gap-1">
      <button type="button" onClick={onZoomOut} disabled={zoom <= 0.75} className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated disabled:opacity-30" aria-label="Zoom out"><Minus className="size-4" /></button>
      <span className="min-w-12 text-center text-xs font-bold text-muted" aria-live="polite">{Math.round(zoom * 100)}%</span>
      <button type="button" onClick={onZoomIn} disabled={zoom >= 2.5} className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated disabled:opacity-30" aria-label="Zoom in"><Plus className="size-4" /></button>
      <button type="button" onClick={onFit} className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated" aria-label="Fit document to width"><Scan className="size-4" /></button>
    </div>
  </div>;
}

function ImageViewer({ url, title }: { url: string; title: string }) {
  const [zoom, setZoom] = useState(1);
  return <div className="h-[72dvh] min-h-[34rem] overflow-auto bg-elevated" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
    <ViewerToolbar zoom={zoom} onZoomOut={() => setZoom((value) => Math.max(0.75, value - 0.25))} onZoomIn={() => setZoom((value) => Math.min(2.5, value + 0.25))} onFit={() => setZoom(1)} />
    <div className="grid min-h-[calc(100%_-_3.5rem)] place-items-start justify-center p-3 sm:p-5">
      <img alt={title} draggable={false} className="h-auto bg-white shadow-soft" src={url} style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "100%" : "none" }} />
    </div>
  </div>;
}

function PdfCanvasViewer({ blob, title, pdfModuleLoader }: { blob: Blob; title: string; pdfModuleLoader: PdfModuleLoader }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setViewportWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", measure); return () => window.removeEventListener("resize", measure); }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => {
    let active = true;
    let loadingTask: PdfLoadingTask | undefined;
    let loadedDocument: PdfDocument | undefined;
    setLoading(true); setError(""); setPageNumber(1); setPdf(null);
    void (async () => {
      try {
        const pdfjs = await pdfModuleLoader();
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(PDF_JS_WORKER_PATH, window.location.origin).toString();
        loadingTask = pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) });
        loadedDocument = await loadingTask.promise;
        if (!active) return;
        setPdf(loadedDocument);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "The PDF preview could not be prepared.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      void loadingTask?.destroy?.();
    };
  }, [blob, pdfModuleLoader]);

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let active = true;
    let renderTask: PdfRenderTask | undefined;
    setRendering(true); setError("");
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (!active || !canvasRef.current) return;
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(280, (viewportWidth || viewportRef.current?.clientWidth || 760) - 32);
        const fitScale = Math.min(2, availableWidth / baseViewport.width);
        const cssScale = fitScale * zoom;
        const outputScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
        const renderViewport = page.getViewport({ scale: cssScale * outputScale });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser could not start the PDF canvas.");
        canvas.width = Math.max(1, Math.floor(renderViewport.width));
        canvas.height = Math.max(1, Math.floor(renderViewport.height));
        canvas.style.width = `${Math.floor(baseViewport.width * cssScale)}px`;
        canvas.style.height = `${Math.floor(baseViewport.height * cssScale)}px`;
        renderTask = page.render({ canvas, canvasContext: context, viewport: renderViewport });
        await renderTask.promise;
        page.cleanup?.();
      } catch (caught) {
        if (active && !(caught instanceof Error && caught.name === "RenderingCancelledException")) setError(caught instanceof Error ? caught.message : "This PDF page could not be rendered.");
      } finally {
        if (active) setRendering(false);
      }
    })();
    return () => { active = false; renderTask?.cancel(); };
  }, [pageNumber, pdf, viewportWidth, zoom]);

  if (loading) return <div className="grid min-h-[62dvh] place-items-center text-center sm:min-h-[70dvh]"><div><Loader2 className="mx-auto size-8 animate-spin text-brand motion-reduce:animate-none" /><p className="mt-4 text-sm font-bold">Preparing the in-app PDF viewer…</p></div></div>;
  if (!pdf || error) return <div className="grid min-h-[62dvh] place-items-center p-8 text-center sm:min-h-[70dvh]"><div><FileWarning className="mx-auto size-8 text-warning" /><p role="alert" className="mt-4 max-w-md text-sm font-bold">{error || "This PDF could not be previewed here."}</p><p className="mt-2 max-w-md text-xs text-muted">Use Open above to continue with your device's PDF viewer.</p></div></div>;

  return <div ref={viewportRef} className="h-[72dvh] min-h-[34rem] overflow-auto bg-elevated" style={{ touchAction: "pan-x pan-y pinch-zoom" }}>
    <ViewerToolbar zoom={zoom} onZoomOut={() => setZoom((value) => Math.max(0.75, value - 0.25))} onZoomIn={() => setZoom((value) => Math.min(2.5, value + 0.25))} onFit={() => setZoom(1)}>
      <button type="button" onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber === 1} className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated disabled:opacity-30" aria-label="Previous PDF page"><ChevronLeft className="size-4" /></button>
      <span className="whitespace-nowrap text-xs font-bold text-muted" aria-live="polite">Page {pageNumber} of {pdf.numPages}</span>
      <button type="button" onClick={() => setPageNumber((value) => Math.min(pdf.numPages, value + 1))} disabled={pageNumber === pdf.numPages} className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated disabled:opacity-30" aria-label="Next PDF page"><ChevronRight className="size-4" /></button>
    </ViewerToolbar>
    <div className="relative flex min-h-[calc(100%_-_3.5rem)] min-w-full items-start justify-center p-4">
      {rendering && <span role="status" className="absolute left-1/2 top-6 z-[1] -translate-x-1/2 rounded-full bg-brand px-3 py-1.5 text-xs font-bold text-surface shadow-soft"><Loader2 className="mr-1 inline size-3 animate-spin motion-reduce:animate-none" /> Rendering page</span>}
      <canvas ref={canvasRef} aria-label={`${title}, PDF page ${pageNumber}`} className="max-w-none bg-white shadow-soft" />
    </div>
  </div>;
}
