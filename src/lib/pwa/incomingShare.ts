import { prepareDocumentFile } from "../../components/FileDropzone";

const cacheName = "trip-vault-incoming-shares-v1";
export async function readIncomingShare(id: string): Promise<File> {
  if (!/^[0-9a-f-]{36}$/i.test(id))
    throw new Error("This shared file link is invalid. Please share the file again.");
  const cache = await caches.open(cacheName);
  const key = new URL(`/receive-share/${id}`, window.location.origin).href;
  const response = await cache.match(key);
  if (!response || Number(response.headers.get("X-Share-Expires")) <= Date.now()) {
    await cache.delete(key);
    throw new Error(
      "This shared file has expired. Please share it again or select the file below."
    );
  }
  const bytes = await response.arrayBuffer();
  const name = decodeURIComponent(response.headers.get("X-Share-Name") || "document");
  return prepareDocumentFile(
    new File([bytes], name, {
      type: response.headers.get("Content-Type") || ""
    })
  );
}

export async function discardIncomingShare(id: string) {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(cacheName);
    await cache.delete(new URL(`/receive-share/${id}`, window.location.origin).href);
  } catch {
    // Storage becoming unavailable must not turn a successful upload into a
    // retryable save failure. The handoff also has a checked expiry deadline.
  }
}

export async function clearIncomingShares() {
  try {
    if ("caches" in window) await caches.delete(cacheName);
  } catch {
    // Do not prevent sign-out if the browser has disabled Cache Storage.
  }
}
