// @vitest-environment node
import { readFileSync } from "node:fs";
import { Blob as NativeBlob, Buffer } from "node:buffer";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { clearIncomingShares, discardIncomingShare, readIncomingShare } from "./incomingShare";

const id = "11223344-5566-4788-8899-aabbccddeeff";
function worker() {
  // Native Request/FormData keep multipart parsing in the same realm as the
  // service worker; jsdom's DOM classes are incompatible with Node's parser.
  vi.stubGlobal("window", { location: { origin: "https://trip-vault.test" } });
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
  Object.assign(window, { caches });
  const postEntries = async (
    entries: Array<[string, string | NativeBlob]>,
    path = "/share-target"
  ) => {
    // Send a real multipart body through Request.formData(), not a getAll mock
    // that ignores field names (which hid the original single-field assumption).
    const boundary = "trip-vault-test-boundary";
    const parts: Array<string | NativeBlob> = [];
    for (const [name, value] of entries) {
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"`);
      if (typeof value === "string") parts.push(`\r\n\r\n${value}\r\n`);
      else {
        const filename = "name" in value ? String(value.name) : "document";
        parts.push(
          `; filename="${filename}"\r\nContent-Type: ${value.type || "application/octet-stream"}\r\n\r\n`,
          value,
          "\r\n"
        );
      }
    }
    parts.push(`--${boundary}--\r\n`);
    let result: Promise<Response> | undefined;
    const request = new Request(new URL(path, window.location.origin), {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: await new NativeBlob(parts).arrayBuffer()
    });
    handlers.get("fetch")!({
      request,
      respondWith: (work: Promise<Response>) => {
        result = work;
      }
    });
    return result;
  };
  const post = (files: NativeBlob[], path = "/share-target") =>
    postEntries(
      files.map((file) => ["files", file]),
      path
    );
  return { records, cache, caches, post, postEntries };
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
    [
      [
        Object.assign(new NativeBlob([new Uint8Array(5_000_000)], { type: "application/pdf" }), {
          name: "large.pdf"
        })
      ],
      "size"
    ],
    [[new NativeBlob(["one"]), new NativeBlob(["two"])], "count"]
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

it("reads file parts across current, legacy, and alternative multipart fields, ignoring text metadata", async () => {
  const { postEntries } = worker();
  for (const field of ["files", "documents", "images", "file", "attachment"]) {
    const file = Object.assign(new NativeBlob(["%PDF-1.7"], { type: "application/pdf" }), {
      name: "ticket.pdf"
    });
    const response = await postEntries([
      ["title", "Trip ticket"],
      ["text", "Some accompanying text"],
      [field, file]
    ]);
    expect(response?.headers.get("location")).toContain(`id=${id}`);
    expect(await readIncomingShare(id)).toMatchObject({ name: "ticket.pdf", size: 8 });
    await discardIncomingShare(id);
  }
});

it("distinguishes no attachment, text/link-only sharing, and multiple actual files without fetching links", async () => {
  const { postEntries, cache } = worker();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await postEntries([]))?.headers.get("location")).toContain("error=no_file");
  expect(
    (await postEntries([["text", "https://example.com/private.pdf"]]))?.headers.get("location")
  ).toContain("error=text_only");
  expect(
    (
      await postEntries([
        ["documents", new NativeBlob(["%PDF-one"])],
        ["images", new NativeBlob(["image"])]
      ])
    )?.headers.get("location")
  ).toContain("error=count");
  expect(cache.put).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it("recognizes supported gallery image bytes with generic image MIME types and rejects unsupported ones", async () => {
  const { postEntries } = worker();
  for (const [signature, expectedType] of [
    [[255, 216, 255, 224], "image/jpeg"],
    [[137, 80, 78, 71, 13, 10, 26, 10], "image/png"],
    [[82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80], "image/webp"]
  ] as const) {
    const response = await postEntries([
      ["images", new NativeBlob([new Uint8Array(signature)], { type: "image/*" })]
    ]);
    expect(response?.headers.get("location")).toContain(`id=${id}`);
    expect((await readIncomingShare(id)).type).toBe(expectedType);
    await discardIncomingShare(id);
  }
  expect(
    (
      await postEntries([["images", new NativeBlob(["GIF89a"], { type: "image/gif" })]])
    )?.headers.get("location")
  ).toContain("error=type");
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
