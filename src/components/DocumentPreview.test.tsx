import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentPreview, documentPreviewKind, type PdfJsModule } from "./DocumentPreview";

afterEach(() => vi.restoreAllMocks());

describe("DocumentPreview", () => {
  it("recognizes PDFs and images even when storage returned a generic MIME type", () => {
    expect(documentPreviewKind("application/octet-stream", "ticket.pdf")).toBe("pdf");
    expect(documentPreviewKind("application/octet-stream", "receipt.PNG")).toBe("image");
    expect(documentPreviewKind("application/octet-stream", "notes.txt")).toBe("unsupported");
  });

  it("renders PDF pages on a canvas with page and zoom controls", async () => {
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

    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    expect(screen.getByLabelText("Train ticket, PDF page 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next PDF page" }));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(workerOptions.workerSrc).toMatch(/\/vendor\/pdfjs\/pdf\.worker\.mjs$/);
    view.unmount();
    expect(destroyLoadingTask).toHaveBeenCalledOnce();
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
