import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentFileActions } from "./DocumentFileActions";

function setup(type = "application/octet-stream", filename = "ticket.pdf") {
  render(
    <DocumentFileActions
      blob={new Blob(["%PDF-test"], { type })}
      url="blob:local-document"
      filename={filename}
      mimeType={type}
    />
  );
  return userEvent.setup();
}
function nativeShare(
  share = vi.fn().mockResolvedValue(undefined),
  canShare = vi.fn().mockReturnValue(true)
) {
  vi.stubGlobal("navigator", { share, canShare });
  return { share, canShare };
}
afterEach(() => vi.unstubAllGlobals());

it.each([
  ["application/octet-stream", "ticket.pdf", "application/pdf"],
  ["image/png", "photo.png", "image/png"]
])(
  "shares the actual %s file with its filename and offers a local download",
  async (type, name, expectedType) => {
    const { share, canShare } = nativeShare();
    const user = setup(type, name);
    const download = screen.getByRole("link", { name: "Download document" });
    expect(download).toHaveAttribute("href", "blob:local-document");
    expect(download).toHaveAttribute("download", name);
    expect(screen.getByText("Download")).toHaveClass("hidden", "sm:inline");
    expect(screen.getByText("Share")).toHaveClass("hidden", "sm:inline");
    await user.click(screen.getByRole("button", { name: "Share document" }));
    const payload = share.mock.calls[0][0] as ShareData;
    expect(Object.keys(payload)).toEqual(["files"]);
    expect(payload.files?.[0]).toBeInstanceOf(File);
    expect(payload.files?.[0]).toMatchObject({ name, type: expectedType, size: 9 });
    expect(canShare).toHaveBeenCalledWith(payload);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  }
);
it.each(["missing", "unsupported"])(
  "explains the download fallback for %s native file sharing",
  async (mode) => {
    const { share } = nativeShare();
    if (mode === "missing") vi.stubGlobal("navigator", {});
    else vi.stubGlobal("navigator", { share, canShare: () => false });
    const user = setup();
    await user.click(screen.getByRole("button", { name: "Share document" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Download the document");
    expect(share).not.toHaveBeenCalled();
  }
);
it("treats cancelling as normal, shows a retry for failure, and never sends a fallback URL", async () => {
  const { share } = nativeShare();
  share
    .mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"))
    .mockRejectedValueOnce(new DOMException("Not allowed", "NotAllowedError"));
  const user = setup();
  const button = screen.getByRole("button", { name: "Share document" });
  await user.click(button);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  await user.click(button);
  expect(await screen.findByRole("status")).toHaveTextContent("Could not open device sharing");
  expect(button).toBeEnabled();
  expect(share).toHaveBeenCalledTimes(2);
  expect(share.mock.calls.every(([payload]) => !payload.url && !payload.text)).toBe(true);
});
it("does not launch duplicate share sheets while the first is pending", async () => {
  let finish!: () => void;
  const share = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  nativeShare(share);
  const user = setup();
  const button = screen.getByRole("button", { name: "Share document" });
  await user.click(button);
  expect(button).toBeDisabled();
  await user.click(button);
  expect(share).toHaveBeenCalledOnce();
  await act(async () => finish());
  await waitFor(() => expect(button).toBeEnabled());
});
