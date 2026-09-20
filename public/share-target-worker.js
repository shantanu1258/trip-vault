/* One-file OS share handoff. Nothing is uploaded until the review form is saved. */
const incomingShareCache = "trip-vault-incoming-shares-v1";
const incomingShareLifetime = 15 * 60 * 1000;

async function cleanIncomingShares() {
  const cache = await caches.open(incomingShareCache);
  for (const key of await cache.keys()) {
    const response = await cache.match(key);
    if (Number(response?.headers.get("X-Share-Expires") || 0) <= Date.now())
      await cache.delete(key);
  }
  return cache;
}

async function receiveSharedDocument(request) {
  const redirect = (query) =>
    Response.redirect(new URL(`/receive-share?${query}`, self.location.origin).href, 303);
  try {
    // Bound ordinary multipart requests before parsing; actual file size is checked below too.
    if (Number(request.headers.get("content-length")) > 5_100_000) return redirect("error=size");
    const form = await request.formData();
    const files = form.getAll("files").filter((value) => typeof value !== "string");
    if (files.length !== 1) return redirect("error=count");
    const file = files[0];
    if (!file.size || file.size >= 5_000_000) return redirect("error=size");
    const inferred = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp"
    };
    // Snapshot bytes while Android's temporary content-provider grant is alive.
    // The cache must hold our own bytes, not a File backed by the sending app.
    const bytes = await file.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength >= 5_000_000) return redirect("error=size");
    const suppliedType = (file.type || "").split(";")[0].trim().toLowerCase();
    let type = suppliedType === "application/x-pdf" ? "application/pdf" : suppliedType;
    if (!type || type === "application/octet-stream" || type === "application/pdf") {
      const isPdf =
        new Uint8Array(bytes, 0, Math.min(5, bytes.byteLength)).every(
          (byte, index) => byte === [37, 80, 68, 70, 45][index]
        ) && bytes.byteLength >= 5;
      type = isPdf
        ? "application/pdf"
        : type === "application/pdf"
          ? type
          : inferred[(file.name || "").toLowerCase().split(".").pop()];
    }
    if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(type))
      return redirect("error=type");
    const cache = await cleanIncomingShares();
    if ((await cache.keys()).length >= 5) return redirect("error=busy");
    const id = crypto.randomUUID();
    await cache.put(
      new URL(`/receive-share/${id}`, self.location.origin).href,
      new Response(bytes, {
        headers: {
          "Content-Type": type,
          "X-Share-Name": encodeURIComponent(
            (
              file.name || (type === "application/pdf" ? "Shared document.pdf" : "Shared image")
            ).slice(0, 250)
          ),
          "X-Share-Expires": String(Date.now() + incomingShareLifetime),
          "Cache-Control": "no-store"
        }
      })
    );
    return redirect(`id=${id}`);
  } catch {
    return redirect("error=unavailable");
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    url.origin === self.location.origin &&
    url.pathname === "/share-target" &&
    event.request.method === "POST"
  ) {
    event.respondWith(receiveSharedDocument(event.request));
  }
});
self.addEventListener("activate", (event) => event.waitUntil(cleanIncomingShares()));
