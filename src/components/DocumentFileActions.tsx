import { Download, Loader2, Share2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const extensions: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

/** Share the already-authorized file bytes, never a private route or storage URL. */
export function DocumentFileActions({
  blob,
  url,
  filename,
  mimeType
}: {
  blob: Blob;
  url: string;
  filename: string;
  mimeType: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  const file = useMemo(() => {
    const normalized = [blob.type, mimeType].map((type) => type.split(";")[0].trim().toLowerCase());
    const suffix = filename.split(".").pop()?.toLowerCase();
    const inferred =
      suffix === "jpeg"
        ? "image/jpeg"
        : Object.keys(extensions).find((type) => extensions[type] === suffix);
    const type =
      normalized.find((type) => type in extensions) ??
      inferred ??
      (blob.type || mimeType || "application/octet-stream");
    const name = filename || `Document.${extensions[type] ?? "bin"}`;
    return new File([blob], name, { type });
  }, [blob, filename, mimeType]);
  useEffect(() => setMessage(""), [file]);

  const share = async () => {
    if (pending.current) return;
    setMessage("");
    try {
      if (
        typeof navigator.share !== "function" ||
        typeof navigator.canShare !== "function" ||
        !navigator.canShare({ files: [file] })
      ) {
        setMessage(
          "File sharing isn’t available in this browser. Download the document, then share it from your device’s Files app."
        );
        return;
      }
      pending.current = true;
      setSharing(true);
      // Call directly in the click handler, before any await loses user activation.
      await navigator.share({ files: [file] });
    } catch (error) {
      if (!(error && typeof error === "object" && "name" in error && error.name === "AbortError"))
        setMessage(
          "Could not open device sharing. Try again, or download the document and share it from Files."
        );
    } finally {
      pending.current = false;
      setSharing(false);
    }
  };
  const buttonClass = "secondary-button min-h-11 min-w-11 gap-1.5 px-3 py-2 text-xs";
  return (
    <>
      <a
        href={url}
        download={file.name}
        className={buttonClass}
        aria-label="Download document"
        title="Download document"
      >
        <Download className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">Download</span>
      </a>
      <button
        type="button"
        onClick={() => void share()}
        disabled={sharing}
        className={buttonClass}
        aria-label="Share document"
        title="Share a copy using your device"
      >
        {sharing ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Share2 className="size-4" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{sharing ? "Sharing…" : "Share"}</span>
      </button>
      {message && (
        <p role="status" className="order-last w-full text-sm text-muted">
          {message}
        </p>
      )}
    </>
  );
}
