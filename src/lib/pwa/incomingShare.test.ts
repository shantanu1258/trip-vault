import { readFileSync } from "node:fs";
import { Blob as NativeBlob, Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { clearIncomingShares, discardIncomingShare, readIncomingShare } from "./incomingShare";

const id = "11223344-5566-4788-8899-aabbccddeeff";
function worker() {
  const records = new Map<string, Response>();
  const cache = {
    match: vi.fn(async (key: string) => records.get(key)?.clone()),
    put: vi.fn(async (key: string, value: Response) => {
      records.set(key, value);
    }),
    delete: vi.fn(async (key: string) => records.delete(key)),
    keys: vi.fn(async () => [...records.keys()])
  };
  const handlers = new Map<string, (event: unknown) => void>();
  const caches = {
    open: vi.fn(async () => cache),
    delete: vi.fn(async () => {
      records.clear();
      return true;
    })
  };
  const context = {
    URL,
    Response,
    Date,
    caches,
    crypto: { randomUUID: () => id },
    self: {
      location: { origin: window.location.origin },
      addEventListener: (name: string, handler: (event: unknown) => void) =>
        handlers.set(name, handler)
    }
  };
  runInNewContext(readFileSync("public/share-target-worker.js", "utf8"), context);
  vi.stubGlobal("caches", caches);
  const post = async (files: object[], path = "/share-target") => {
    let result: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: {
        url: new URL(path, window.location.origin).href,
        method: "POST",
        headers: new Headers(),
        formData: async () => ({ getAll: () => files })
      },
      respondWith: (work: Promise<Response>) => {
        result = work;
      }
    });
    return result;
  };
  return { records, cache, caches, post };
}
afterEach(() => vi.unstubAllGlobals());

it("receives one valid file locally, redirects to review, and expires or discards its temporary bytes", async () => {
  const { post, cache } = worker();
  // Use a Blob carrying a filename: the worker only needs the standard File fields.
  const file = Object.assign(new NativeBlob(["%PDF-1.7"], { type: "application/pdf" }), {
    name: "My passport.pdf"
  });
  const response = await post([file]);
  expect(response?.status).toBe(303);
  expect(response?.headers.get("location")).toContain(`/receive-share?id=${id}`);
  expect(cache.put).toHaveBeenCalledOnce();
  const incoming = await readIncomingShare(id);
  expect(incoming.name).toBe("My passport.pdf");
  expect(incoming.type).toBe("application/pdf");
  expect(incoming.size).toBe(8);
  await discardIncomingShare(id);
  await expect(readIncomingShare(id)).rejects.toThrow("expired");
  await post([file]);
  vi.spyOn(Date, "now").mockReturnValue(Date.now() + 16 * 60_000);
  await expect(readIncomingShare(id)).rejects.toThrow("expired");
  vi.restoreAllMocks();
});

it("rejects unsupported, oversized, and multiple files without storing them; ignores unrelated requests", async () => {
  const { post, cache, caches } = worker();
  for (const [files, reason] of [
    [
      [Object.assign(new NativeBlob(["<svg/>"], { type: "image/svg+xml" }), { name: "bad.svg" })],
      "type"
    ],
    [[{ name: "large.pdf", type: "application/pdf", size: 5_000_000 }], "size"],
    [[{ size: 12 }, { size: 12 }], "count"]
  ] as const) {
    expect((await post([...files]))?.headers.get("location")).toContain(`error=${reason}`);
  }
  expect(await post([], "/other")).toBeUndefined();
  expect(cache.put).not.toHaveBeenCalled();
  await clearIncomingShares();
  expect(caches.delete).toHaveBeenCalledWith("trip-vault-incoming-shares-v1");
  caches.open.mockRejectedValueOnce(new Error("Storage disabled"));
  await expect(discardIncomingShare(id)).resolves.toBeUndefined();
  caches.delete.mockRejectedValueOnce(new Error("Storage disabled"));
  await expect(clearIncomingShares()).resolves.toBeUndefined();
});

it("retains all 800 KB from Android files with a generic MIME type and no filename extension", async () => {
  const { post, cache } = worker();
  const bytes = new Uint8Array(800_000);
  bytes.set([37, 80, 68, 70, 45, 49, 46, 55]);
  for (const [name, type] of [
    ["", "application/octet-stream"],
    ["ticket", "application/x-pdf"],
    ["ticket.pdf", "application/pdf; charset=binary"]
  ]) {
    const file = Object.assign(new NativeBlob([bytes], { type }), { name });
    const response = await post([file]);
    expect(response?.headers.get("location")).toContain(`id=${id}`);
    const cached = await cache.match(new URL(`/receive-share/${id}`, window.location.origin).href);
    expect(Buffer.from(await cached!.arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);
    const received = await readIncomingShare(id);
    expect(received.size).toBe(800_000);
    expect(received.type).toBe("application/pdf");
    expect(received.name).toBe(name || "Shared document.pdf");
    await discardIncomingShare(id);
  }
});
