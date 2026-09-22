import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { DocumentPreview } from "../../components/DocumentPreview";
import { DocumentFileActions } from "../../components/DocumentFileActions";
import { DocumentVisibilityIcon } from "../../components/DocumentVisibilityIcon";
import { DocumentTypeIcon } from "../../components/DocumentTypeIcon";
import { ModalSheet } from "../../components/ModalSheet";
import { getErrorMessage } from "../trips/presentation";
import {
  deleteAccountDocumentUpload,
  listAccountDocumentUploads,
  openPersonalDocument,
  retryAccountDocumentUpload
} from "./api";
import type { AccountDocumentUpload } from "./types";

export const personalDocumentKinds = [
  { value: "passport", label: "Passport" },
  { value: "aadhaar", label: "Aadhaar" },
  { value: "identity", label: "Other identity document" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other document" }
] as const;

export function PersonalDocuments() {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const query = useQuery({
    queryKey: ["account-document-uploads"],
    queryFn: listAccountDocumentUploads
  });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AccountDocumentUpload | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["account-document-uploads"] });
  const remove = useMutation({ mutationFn: deleteAccountDocumentUpload, onSuccess: refresh });
  const retry = useMutation({ mutationFn: retryAccountDocumentUpload, onSuccess: refresh });
  const documents = (query.data ?? []).filter(
    (upload) =>
      upload.personal_title &&
      `${upload.personal_title} ${upload.personal_kind} ${upload.personal_label ?? ""}`
        .toLowerCase()
        .includes(search.toLowerCase())
  );
  return (
    <section className="mt-4">
      <p className="text-xs text-muted">Only you · No trip required</p>
      <label className="sr-only" htmlFor="personal-search">
        Search personal documents
      </label>
      <input
        id="personal-search"
        className="form-input mt-3"
        placeholder="Search personal documents"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {(query.error || remove.error || retry.error) && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {getErrorMessage(query.error || remove.error || retry.error)}
        </p>
      )}
      {query.isPending && <p className="mt-4 text-sm text-muted">Opening personal documents…</p>}
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {documents.map((upload) => (
          <article key={upload.id} className="surface-card p-3">
            <button
              type="button"
              className="flex min-h-11 w-full items-start gap-2.5 text-left"
              onClick={() => setSelected(upload)}
            >
              <DocumentTypeIcon type={upload.personal_kind ?? "other"} emphasis="strong" />
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-bold">{upload.personal_title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {personalDocumentKinds.find((kind) => kind.value === upload.personal_kind)?.label}
                  <DocumentVisibilityIcon
                    visibility="private"
                    documentTitle={upload.personal_title || "Personal document"}
                  />
                </span>
                {upload.personal_label && (
                  <span className="mt-1 block break-words text-xs text-muted">
                    {upload.personal_label}
                  </span>
                )}
              </span>
            </button>
            <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
              <span>
                {upload.stored_at
                  ? "Stored privately"
                  : upload.sync_error
                    ? "Cloud upload needs attention"
                    : "Saved on device · cloud pending"}
              </span>
              <div className="flex items-center">
                {upload.sync_state === "queued" && (
                  <button
                    type="button"
                    className="tap-target px-2 text-brand"
                    disabled={retry.isPending || !navigator.onLine}
                    onClick={() => retry.mutate(upload.id)}
                    aria-label={`Retry upload of ${upload.personal_title}`}
                  >
                    <RefreshCw className="size-4" />
                  </button>
                )}
                <button
                  type="button"
                  className="tap-target px-2 text-danger"
                  disabled={remove.isPending || upload.association_pending}
                  aria-label={`Delete ${upload.personal_title}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Delete personal document?",
                        message: `Permanently delete ${upload.personal_title}? This cannot be undone.`,
                        confirmLabel: "Delete",
                        tone: "danger"
                      })
                    )
                      remove.mutate(upload);
                  }}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!query.isPending && !query.error && !documents.length && (
        <p className="mt-5 text-sm text-muted">
          {search
            ? "No personal documents match this search."
            : "No personal documents yet. Add a passport, Aadhaar, or another file without choosing a trip."}{" "}
          <Link className="font-bold text-brand" to="/vault/add">
            Add document
          </Link>
        </p>
      )}
      {selected && <PersonalDocumentPreview upload={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}

function PersonalDocumentPreview({
  upload,
  onClose
}: {
  upload: AccountDocumentUpload;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const query = useQuery({
    queryKey: ["personal-document-file", upload.owner_id, upload.id],
    queryFn: () => openPersonalDocument(upload),
    gcTime: 0,
    retry: false
  });
  useEffect(() => {
    if (!query.data) return;
    const objectUrl = URL.createObjectURL(query.data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [query.data]);
  return (
    <ModalSheet
      eyebrow="Personal document · Only me"
      title={upload.personal_title!}
      onClose={onClose}
    >
      <div className="mt-3 flex items-center gap-2 text-xs text-muted">
        <DocumentTypeIcon type={upload.personal_kind ?? "other"} size="sm" emphasis="strong" />
        <span>Who can open this?</span>
        <DocumentVisibilityIcon
          interactive
          visibility="private"
          documentTitle={upload.personal_title || "Personal document"}
        />
      </div>
      {query.isPending && <p className="mt-4 text-sm">Opening document…</p>}
      {query.error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {getErrorMessage(query.error)}
        </p>
      )}
      {query.data && url && (
        <div className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <DocumentFileActions
              blob={query.data}
              url={url}
              filename={upload.original_filename}
              mimeType={upload.mime_type}
            />
          </div>
          <DocumentPreview
            blob={query.data}
            url={url}
            title={upload.personal_title!}
            mimeType={upload.mime_type}
            filename={upload.original_filename}
          />
        </div>
      )}
    </ModalSheet>
  );
}
