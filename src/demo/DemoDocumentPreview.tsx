import { ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { ModalSheet } from "../components/ModalSheet";
import { DocumentPreview } from "../components/DocumentPreview";
import { DocumentFileActions } from "../components/DocumentFileActions";
import { DocumentVisibilityIcon } from "../components/DocumentVisibilityIcon";
import { DocumentTypeIcon } from "../components/DocumentTypeIcon";
import { documentById } from "./data";
import { demoVaultDocumentById } from "./model";

/** Uses only bundled synthetic files, never signed-in Vault APIs. */
export function DemoDocumentPreview({
  documentId,
  onClose
}: {
  documentId: string;
  onClose: () => void;
}) {
  const document = documentById.get(documentId)!;
  const metadata = demoVaultDocumentById.get(documentId)!;
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setBlob(null);
    setError("");
    void fetch(document.url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Sample file unavailable");
        const file = await response.blob();
        if (!controller.signal.aborted) setBlob(file);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Could not load this sample. Use Open to try the device viewer.");
      });
    return () => controller.abort();
  }, [document.url]);
  return (
    <ModalSheet
      eyebrow="Sample document · No real personal data"
      title={document.title}
      onClose={onClose}
    >
      <div className="my-3 flex flex-wrap items-center gap-2">
        <DocumentTypeIcon type={metadata.category} size="sm" />
        <DocumentVisibilityIcon
          interactive
          visibility={metadata.visibility}
          documentTitle={document.title}
        />
        <a
          className="secondary-button ml-auto min-h-11 px-3 text-xs"
          href={document.url}
          target="_blank"
          rel="noreferrer"
          aria-label="Open with device viewer"
        >
          <ExternalLink className="size-4" /> Open
        </a>
        {blob && (
          <DocumentFileActions
            blob={blob}
            url={document.url}
            filename={`${document.id}.pdf`}
            mimeType="application/pdf"
          />
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : blob ? (
        <DocumentPreview
          blob={blob}
          url={document.url}
          title={document.title}
          filename={`${document.id}.pdf`}
          mimeType="application/pdf"
        />
      ) : (
        <p role="status" className="text-sm text-muted">
          Loading sample document…
        </p>
      )}
    </ModalSheet>
  );
}
