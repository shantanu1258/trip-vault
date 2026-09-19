import { FileWarning, Loader2, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";

const PDF_JS_MODULE_PATH = "/vendor/pdfjs/pdf.mjs";
const PDF_JS_WORKER_PATH = "/vendor/pdfjs/pdf.worker.mjs";

type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfPage = {
  getViewport: (input: { scale: number }) => PdfViewport;
  render: (input: {
    canvas: HTMLCanvasElement;
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
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
  type Capability<T> = {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
  const compatiblePromise = Promise as PromiseConstructor & {
    withResolvers?: <T>() => Capability<T>;
  };
  if (compatiblePromise.withResolvers) return;
  compatiblePromise.withResolvers = <T,>() => {
    let resolve!: Capability<T>["resolve"];
    let reject!: Capability<T>["reject"];
    const promise = new Promise<T>((nextResolve, nextReject) => {
      resolve = nextResolve;
      reject = nextReject;
    });
    return { promise, resolve, reject };
  };
}

export async function loadPdfJs(): Promise<PdfJsModule> {
  // PDF.js 6 uses this small ES2024 helper. Keep the viewer working on older
  // installed-PWA browser engines while the native Open action remains fallback.
  ensurePromiseWithResolvers();
  // Resolve at runtime so Vite does not treat a public asset as a source import.
  const moduleUrl = new URL(PDF_JS_MODULE_PATH, window.location.origin).href;
  return import(/* @vite-ignore */ moduleUrl) as Promise<PdfJsModule>;
}

export function documentPreviewKind(mimeType: string, filename: string) {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedName = filename.toLowerCase();
  if (normalizedMime === "application/pdf" || normalizedName.endsWith(".pdf"))
    return "pdf" as const;
  if (normalizedMime.startsWith("image/") || /\.(?:jpe?g|png|webp)$/.test(normalizedName))
    return "image" as const;
  return "unsupported" as const;
}

export function DocumentPreview({
  blob,
  url,
  title,
  mimeType,
  filename,
  pdfModuleLoader = loadPdfJs
}: {
  blob: Blob;
  url: string;
  title: string;
  mimeType: string;
  filename: string;
  pdfModuleLoader?: PdfModuleLoader;
}) {
  const kind = documentPreviewKind(mimeType || blob.type, filename);
  if (kind === "pdf")
    return <PdfCanvasViewer blob={blob} title={title} pdfModuleLoader={pdfModuleLoader} />;
  if (kind === "image") return <ImageViewer url={url} title={title} />;
  return (
    <div className="grid min-h-[62dvh] place-items-center p-8 text-center sm:min-h-[70dvh]">
      <div>
        <FileWarning className="mx-auto size-8 text-warning" />
        <p className="mt-4 max-w-md text-sm font-bold">
          This file type cannot be previewed here. Use Open to view it with your device.
        </p>
      </div>
    </div>
  );
}

function ViewerToolbar({
  zoom,
  onZoomOut,
  onZoomIn,
  onFit,
  fullscreen,
  onFullscreen,
  children
}: {
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onFit: () => void;
  fullscreen?: boolean;
  onFullscreen?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="sticky left-0 top-0 z-10 flex min-h-12 items-center justify-between gap-1 border-b border-line bg-surface/95 px-1 py-1 backdrop-blur sm:px-2">
      <div className="flex items-center gap-1">{children}</div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= 0.75}
          className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated disabled:opacity-30"
          aria-label="Zoom out"
        >
          <Minus className="size-4" />
        </button>
        <button
          type="button"
          onClick={onFit}
          className="tap-target rounded-xl px-1 text-center text-xs font-bold text-muted hover:bg-elevated"
          aria-label="Fit document to width"
          title="Fit document to width"
        >
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        </button>
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= 2.5}
          className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated disabled:opacity-30"
          aria-label="Zoom in"
        >
          <Plus className="size-4" />
        </button>
        {onFullscreen && (
          <button
            type="button"
            className="tap-target grid size-10 place-items-center rounded-xl hover:bg-elevated"
            onClick={onFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen document"}
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

function useViewerFullscreen(ref: RefObject<HTMLDivElement>) {
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [ref]);
  const toggle = document.fullscreenEnabled
    ? () => {
        setFullscreenError("");
        const action =
          document.fullscreenElement === ref.current
            ? document.exitFullscreen()
            : ref.current?.requestFullscreen();
        void action?.catch(() =>
          setFullscreenError("Fullscreen is unavailable. You can still zoom here or use Open.")
        );
      }
    : undefined;
  return { fullscreen, fullscreenError, toggle };
}

function ImageViewer({ url, title }: { url: string; title: string }) {
  const [zoom, setZoom] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { fullscreen, fullscreenError, toggle } = useViewerFullscreen(viewportRef);
  return (
    <div
      ref={viewportRef}
      className="h-[75dvh] min-h-80 overflow-auto bg-elevated [scrollbar-gutter:stable] [&:fullscreen]:h-screen [&:fullscreen]:w-screen"
      style={{ touchAction: "pan-x pan-y pinch-zoom" }}
    >
      <ViewerToolbar
        zoom={zoom}
        onZoomOut={() => setZoom((value) => Math.max(0.75, value - 0.25))}
        onZoomIn={() => setZoom((value) => Math.min(2.5, value + 0.25))}
        onFit={() => setZoom(1)}
        fullscreen={fullscreen}
        onFullscreen={toggle}
      />
      {fullscreenError && (
        <p role="status" className="p-2 text-xs text-muted">
          {fullscreenError}
        </p>
      )}
      <div className="grid min-h-[calc(100%_-_3.5rem)] place-items-start justify-center p-3 sm:p-5">
        <img
          alt={title}
          draggable={false}
          className="h-auto bg-white shadow-soft"
          src={url}
          style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "100%" : "none" }}
        />
      </div>
    </div>
  );
}

function PdfCanvasViewer({
  blob,
  title,
  pdfModuleLoader
}: {
  blob: Blob;
  title: string;
  pdfModuleLoader: PdfModuleLoader;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { fullscreen, fullscreenError, toggle } = useViewerFullscreen(viewportRef);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const measure = () => setViewportWidth(node.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [pdf]);

  useEffect(() => {
    let active = true;
    let loadingTask: PdfLoadingTask | undefined;
    let loadedDocument: PdfDocument | undefined;
    setLoading(true);
    setError("");
    setZoom(1);
    setPdf(null);
    void (async () => {
      try {
        const pdfjs = await pdfModuleLoader();
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          PDF_JS_WORKER_PATH,
          window.location.origin
        ).toString();
        const data = new Uint8Array(await blob.arrayBuffer());
        if (!active) return;
        loadingTask = pdfjs.getDocument({ data });
        loadedDocument = await loadingTask.promise;
        if (!active) return;
        setPdf(loadedDocument);
      } catch (caught) {
        if (active)
          setError(
            caught instanceof Error ? caught.message : "The PDF preview could not be prepared."
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
      void loadingTask?.destroy?.();
    };
  }, [blob, pdfModuleLoader]);

  if (loading)
    return (
      <div className="grid min-h-[62dvh] place-items-center text-center sm:min-h-[70dvh]">
        <div>
          <Loader2 className="mx-auto size-8 animate-spin text-brand motion-reduce:animate-none" />
          <p className="mt-4 text-sm font-bold">Preparing the in-app PDF viewer…</p>
        </div>
      </div>
    );
  if (!pdf || error)
    return (
      <div className="grid min-h-[62dvh] place-items-center p-8 text-center sm:min-h-[70dvh]">
        <div>
          <FileWarning className="mx-auto size-8 text-warning" />
          <p role="alert" className="mt-4 max-w-md text-sm font-bold">
            {error || "This PDF could not be previewed here."}
          </p>
          <p className="mt-2 max-w-md text-xs text-muted">
            Use Open above to continue with your device's PDF viewer.
          </p>
        </div>
      </div>
    );

  return (
    <div
      ref={viewportRef}
      className="h-[75dvh] min-h-80 overflow-auto bg-elevated [scrollbar-gutter:stable] [&:fullscreen]:h-screen [&:fullscreen]:w-screen"
      role="region"
      aria-label="PDF pages, scroll vertically"
      tabIndex={0}
      style={{ touchAction: "pan-x pan-y pinch-zoom" }}
    >
      <ViewerToolbar
        zoom={zoom}
        onZoomOut={() => setZoom((value) => Math.max(0.75, value - 0.25))}
        onZoomIn={() => setZoom((value) => Math.min(2.5, value + 0.25))}
        onFit={() => setZoom(1)}
        fullscreen={fullscreen}
        onFullscreen={toggle}
      >
        <span className="whitespace-nowrap px-2 text-xs font-bold text-muted">
          {pdf.numPages} {pdf.numPages === 1 ? "page" : "pages"}
        </span>
      </ViewerToolbar>
      {fullscreenError && (
        <p role="status" className="p-2 text-xs text-muted">
          {fullscreenError}
        </p>
      )}
      <div className="w-max min-w-full space-y-3 p-2">
        {Array.from({ length: pdf.numPages }, (_, index) => (
          <PdfPageCanvas
            key={index + 1}
            pdf={pdf}
            pageNumber={index + 1}
            title={title}
            width={Math.max(1, (viewportWidth || 320) - 16)}
            zoom={zoom}
            scrollRoot={viewportRef}
          />
        ))}
      </div>
    </div>
  );
}

function PdfPageCanvas({
  pdf,
  pageNumber,
  title,
  width,
  zoom,
  scrollRoot
}: {
  pdf: PdfDocument;
  pageNumber: number;
  title: string;
  width: number;
  zoom: number;
  scrollRoot: RefObject<HTMLDivElement>;
}) {
  const pageRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [nearby, setNearby] = useState(
    typeof IntersectionObserver === "undefined" || pageNumber === 1
  );
  const [ratio, setRatio] = useState(4 / 3);
  const [rendering, setRendering] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const displayWidth = Math.floor(width * zoom);

  useEffect(() => {
    if (!pageRef.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setNearby(entry.isIntersecting), {
      root: scrollRoot.current,
      rootMargin: "700px 0px"
    });
    observer.observe(pageRef.current);
    return () => observer.disconnect();
  }, [scrollRoot]);

  useEffect(() => {
    if (!nearby || !canvasRef.current) return;
    let active = true;
    const canvas = canvasRef.current;
    let task: PdfRenderTask | undefined;
    setRendering(true);
    setError("");
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (!active) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        const cssScale = displayWidth / base.width;
        // Limit very large/zoomed pages on memory-constrained phones.
        const outputScale = Math.min(
          2,
          window.devicePixelRatio || 1,
          Math.sqrt(8_000_000 / ((displayWidth * displayWidth * base.height) / base.width))
        );
        const viewport = page.getViewport({ scale: cssScale * outputScale });
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) throw new Error("This browser could not start the PDF canvas.");
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        task = page.render({ canvas, canvasContext: context, viewport });
        await task.promise;
      } catch (caught) {
        if (active && !(caught instanceof Error && caught.name === "RenderingCancelledException"))
          setError("This page could not be rendered. Try again or use Open.");
      } finally {
        if (active) setRendering(false);
      }
    })();
    return () => {
      active = false;
      task?.cancel();
      // The canvas is replaced on zoom/resize, so a cancelled render cannot draw over a new one.
      void (task?.promise ?? Promise.resolve())
        .catch(() => undefined)
        .then(() => {
          canvas.width = 0;
          canvas.height = 0;
        });
    };
  }, [pdf, pageNumber, nearby, displayWidth, retry]);

  return (
    <figure
      ref={pageRef}
      className="mx-auto"
      style={{ width: displayWidth }}
      aria-label={`Page ${pageNumber}`}
    >
      <figcaption className="mb-1 text-center text-xs text-muted">Page {pageNumber}</figcaption>
      <div
        className="relative bg-white shadow-soft"
        style={{ height: Math.floor(displayWidth * ratio) }}
      >
        {nearby && (
          <canvas
            key={`${displayWidth}:${retry}`}
            ref={canvasRef}
            aria-label={`${title}, PDF page ${pageNumber}`}
            className="block size-full"
          />
        )}
        {nearby && rendering && (
          <span
            role="status"
            className="absolute inset-0 grid place-items-center text-xs text-gray-600"
          >
            <span>
              <Loader2 className="mr-1 inline size-4 animate-spin motion-reduce:animate-none" />
              Loading page {pageNumber}…
            </span>
          </span>
        )}
        {nearby && error && (
          <div
            role="alert"
            className="absolute inset-0 grid place-content-center gap-3 p-4 text-center text-sm text-gray-700"
          >
            <p>{error}</p>
            <button className="secondary-button" onClick={() => setRetry((value) => value + 1)}>
              Retry page {pageNumber}
            </button>
          </div>
        )}
      </div>
    </figure>
  );
}
