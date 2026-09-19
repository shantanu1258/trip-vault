import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentPreview, documentPreviewKind, type PdfJsModule } from "./DocumentPreview";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DocumentPreview", () => {
  it("recognizes PDFs and images even when storage returned a generic MIME type", () => {
    expect(documentPreviewKind("application/octet-stream", "ticket.pdf")).toBe("pdf");
    expect(documentPreviewKind("application/octet-stream", "receipt.PNG")).toBe("image");
    expect(documentPreviewKind("application/octet-stream", "notes.txt")).toBe("unsupported");
  });

  it("stacks all PDF pages vertically, without next/previous controls, and zooms or fits them together", async () => {
    const user = userEvent.setup();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D
    );
    const renderPage = vi.fn(() => ({ promise: Promise.resolve(), cancel: vi.fn() }));
    const getPage = vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: renderPage,
      cleanup: vi.fn()
    }));
    const pdf = { numPages: 2, getPage };
    const destroyLoadingTask = vi.fn(async () => undefined);
    const workerOptions = { workerSrc: "" };
    const loader = vi.fn(
      async () =>
        ({
          GlobalWorkerOptions: workerOptions,
          getDocument: () => ({ promise: Promise.resolve(pdf), destroy: destroyLoadingTask })
        }) as PdfJsModule
    );
    const blob = { type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(12) } as Blob;

    const view = render(
      <DocumentPreview
        blob={blob}
        url="blob:ticket"
        title="Train ticket"
        mimeType="application/pdf"
        filename="ticket.pdf"
        pdfModuleLoader={loader}
      />
    );

    expect(await screen.findByText("2 pages")).toBeInTheDocument();
    await waitFor(() => expect(renderPage).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Train ticket, PDF page 1")).toBeInTheDocument();
    expect(screen.getByLabelText("Train ticket, PDF page 2")).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledWith(2);
    expect(screen.getByRole("region", { name: "PDF pages, scroll vertically" })).toHaveAttribute(
      "tabindex",
      "0"
    );
    expect(screen.queryByRole("button", { name: "Next PDF page" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous PDF page" })).not.toBeInTheDocument();
    const firstWidth = (screen.getByLabelText("Train ticket, PDF page 1") as HTMLCanvasElement)
      .width;
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (screen.getByLabelText("Train ticket, PDF page 1") as HTMLCanvasElement).width
      ).toBeGreaterThan(firstWidth)
    );
    await user.click(screen.getByRole("button", { name: "Fit document to width" }));
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(workerOptions.workerSrc).toMatch(/\/vendor\/pdfjs\/pdf\.worker\.mjs$/);
    view.unmount();
    expect(destroyLoadingTask).toHaveBeenCalledOnce();
  });

  it("only renders nearby pages and releases canvases that scroll away", async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          callbacks.push(callback);
        }
        observe() {}
        disconnect() {}
      }
    );
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D
    );
    const getPage = vi.fn(async () => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: () => ({ promise: Promise.resolve(), cancel: vi.fn() })
    }));
    const loader = async () => ({
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: () => ({ promise: Promise.resolve({ numPages: 10, getPage }) })
    });
    const blob = { type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(1) } as Blob;
    render(
      <DocumentPreview
        blob={blob}
        url="blob:test"
        title="Ticket"
        mimeType="application/pdf"
        filename="test.pdf"
        pdfModuleLoader={loader}
      />
    );
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(1));
    expect(getPage).not.toHaveBeenCalledWith(10);
    expect(screen.queryByLabelText("Ticket, PDF page 10")).not.toBeInTheDocument();
    act(() =>
      callbacks[9](
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    await waitFor(() => expect(getPage).toHaveBeenCalledWith(10));
    expect(screen.getByLabelText("Ticket, PDF page 10")).toBeInTheDocument();
    act(() =>
      callbacks[9](
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver
      )
    );
    expect(screen.queryByLabelText("Ticket, PDF page 10")).not.toBeInTheDocument();
    expect(screen.getByRole("figure", { name: "Page 10" })).toBeInTheDocument();
  });

  it("keeps other pages available when one fails and retries that page", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      {} as CanvasRenderingContext2D
    );
    let failSecond = true;
    const getPage = vi.fn(async (number: number) => {
      if (number === 2 && failSecond) throw new Error("Bad page");
      return {
        getViewport: ({ scale }: { scale: number }) => ({
          width: 600 * scale,
          height: 800 * scale
        }),
        render: () => ({ promise: Promise.resolve(), cancel: vi.fn() })
      };
    });
    const loader = async () => ({
      GlobalWorkerOptions: { workerSrc: "" },
      getDocument: () => ({ promise: Promise.resolve({ numPages: 2, getPage }) })
    });
    const blob = { type: "application/pdf", arrayBuffer: async () => new ArrayBuffer(1) } as Blob;
    render(
      <DocumentPreview
        blob={blob}
        url="blob:test"
        title="Ticket"
        mimeType="application/pdf"
        filename="test.pdf"
        pdfModuleLoader={loader}
      />
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("This page could not be rendered");
    expect(screen.getByLabelText("Ticket, PDF page 1")).toBeInTheDocument();
    failSecond = false;
    await userEvent.click(screen.getByRole("button", { name: "Retry page 2" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("provides in-app image zoom without turning the preview into an external link", async () => {
    const user = userEvent.setup();
    render(
      <DocumentPreview
        blob={new Blob(["image"], { type: "image/png" })}
        url="blob:photo"
        title="Hotel voucher"
        mimeType="image/png"
        filename="voucher.png"
      />
    );

    expect(screen.getByRole("img", { name: "Hotel voucher" })).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
  });
});
