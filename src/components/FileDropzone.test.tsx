import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FileDropzone, prepareDocumentFile } from "./FileDropzone";

describe("FileDropzone", () => {
  it("uses a large centered picker and reports the selected file", async () => {
    const user = userEvent.setup();
    const onFileChange = vi.fn();
    const file = new File(["%PDF-test"], "boarding-pass.pdf", { type: "application/pdf" });
    const view = render(
      <FileDropzone
        name="file"
        label="Travel document"
        prompt="Choose the PDF or image"
        file={null}
        onFileChange={onFileChange}
      />
    );

    expect(screen.getByRole("button", { name: /choose the pdf or image/i })).toHaveClass(
      "min-h-32"
    );
    await user.upload(screen.getByLabelText("Travel document"), file);
    expect(onFileChange).toHaveBeenCalledWith(file);
    view.rerender(
      <FileDropzone
        name="file"
        label="Travel document"
        prompt="Choose the PDF or image"
        file={file}
        onFileChange={onFileChange}
      />
    );
    expect(screen.getByText("boarding-pass.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Select to choose a different file/)).toBeInTheDocument();
    expect(screen.getByText("boarding-pass.pdf selected")).toHaveAttribute("aria-live", "polite");
  });

  it("accepts drag and drop", () => {
    const onFileChange = vi.fn();
    const file = new File(["photo"], "hotel.webp", { type: "image/webp" });
    render(
      <FileDropzone name="file" label="Travel document" file={null} onFileChange={onFileChange} />
    );

    fireEvent.drop(screen.getByRole("button", { name: /travel document/i }), {
      dataTransfer: { files: [file] }
    });
    expect(onFileChange).toHaveBeenCalledWith(file);
  });

  it("is keyboard operable", async () => {
    const user = userEvent.setup();
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<FileDropzone name="file" label="Travel document" file={null} onFileChange={vi.fn()} />);

    await user.tab();
    expect(screen.getByRole("button", { name: /travel document/i })).toHaveFocus();
    await user.keyboard("[Enter]");
    expect(inputClick).toHaveBeenCalledOnce();
    inputClick.mockRestore();
  });

  it("clears the native picker before opening so the same file can be selected again", async () => {
    const user = userEvent.setup();
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<FileDropzone name="file" label="Travel document" file={null} onFileChange={vi.fn()} />);
    const input = screen.getByLabelText("Travel document") as HTMLInputElement;
    Object.defineProperty(input, "value", {
      configurable: true,
      writable: true,
      value: "C:\\fakepath\\ticket.pdf"
    });

    await user.click(screen.getByRole("button", { name: /travel document/i }));

    expect(input.value).toBe("");
    expect(inputClick).toHaveBeenCalledOnce();
    inputClick.mockRestore();
  });

  it("rejects unsupported files before submission", () => {
    const onFileChange = vi.fn();
    render(
      <FileDropzone name="file" label="Travel document" file={null} onFileChange={onFileChange} />
    );

    fireEvent.change(screen.getByLabelText("Travel document"), {
      target: { files: [new File(["x"], "page.html", { type: "text/html" })] }
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Use a PDF, JPEG, PNG, or WebP file");
    expect(onFileChange).toHaveBeenLastCalledWith(null);
  });

  it("normalizes a phone's generic MIME type from a supported extension", () => {
    const original = new File(["%PDF-test"], "ticket.pdf", { type: "application/octet-stream" });
    const prepared = prepareDocumentFile(original);
    expect(prepared.name).toBe("ticket.pdf");
    expect(prepared.type).toBe("application/pdf");
  });

  it("rejects a file at the five-megabyte service limit", () => {
    const file = new File([new Uint8Array(5_000_000)], "large-ticket.pdf", {
      type: "application/pdf"
    });
    expect(() => prepareDocumentFile(file)).toThrow("Choose a file smaller than 5 MB");
  });

  it("disables selection and announces a busy save", () => {
    render(
      <FileDropzone
        name="file"
        label="Travel document"
        file={new File(["x"], "ticket.pdf", { type: "application/pdf" })}
        onFileChange={vi.fn()}
        busy
      />
    );
    expect(screen.getByRole("button", { name: /saving file/i })).toBeDisabled();
    expect(screen.getByLabelText("Travel document")).toBeDisabled();
  });
});
