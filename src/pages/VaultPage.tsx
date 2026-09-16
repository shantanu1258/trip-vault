import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  CloudUpload,
  FileCheck2,
  FileSearch,
  FileText,
  LockKeyhole,
  Search
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DocumentVisibilityBadge } from "../components/DocumentVisibilityBadge";
import { EmptyState, ErrorCard, LoadingCard, PageHeader } from "../components/TripUi";
import {
  listArchivedVaultDocuments,
  listVaultDocuments,
  restoreDocument
} from "../features/workspace/api";
import { documentPurposeLabel } from "../features/workspace/documentModel";

export function VaultPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showArchived, setShowArchived] = useState(false);
  const query = useQuery({ queryKey: ["documents"], queryFn: () => listVaultDocuments() });
  const archivedQuery = useQuery({
    queryKey: ["documents", "archived"],
    queryFn: listArchivedVaultDocuments,
    enabled: showArchived && navigator.onLine
  });
  const restore = useMutation({
    mutationFn: restoreDocument,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
        queryClient.invalidateQueries({ queryKey: ["documents", "archived"] })
      ]);
    }
  });
  const source = showArchived ? (archivedQuery.data ?? []) : (query.data ?? []);
  const documents = useMemo(
    () =>
      source.filter(
        (document) =>
          (category === "all" || document.category === category) &&
          `${document.title} ${document.purpose} ${document.short_label ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [source, search, category]
  );
  const categories = Array.from(new Set((query.data ?? []).map((document) => document.category)));
  return (
    <AppShell>
      <div className="mx-auto min-w-0 max-w-5xl">
        <PageHeader
          eyebrow="Secure files"
          title="Document Vault"
          text="Search authorized document metadata across every trip. Files open from the verified device copy first when available."
          action={
            <button
              type="button"
              disabled={!navigator.onLine && !showArchived}
              onClick={() => setShowArchived((value) => !value)}
              className="secondary-button"
            >
              <ArchiveRestore className="size-4" />{" "}
              {showArchived ? "Current documents" : "Recently deleted"}
            </button>
          }
        />
        {query.isLoading && <LoadingCard label="Opening your Vault" />}
        {query.error && <ErrorCard error={query.error} />}
        {!showArchived && query.data && query.data.length === 0 && (
          <EmptyState
            icon={<LockKeyhole className="size-7" />}
            title="Your Vault is empty"
            text="Open a trip and upload a PDF or image smaller than 5 MB. New documents are visible to all signed-in trip members by default, and you can change that while uploading."
            action={
              <Link className="primary-button" to="/trips">
                Choose a trip
              </Link>
            }
          />
        )}
        {(showArchived || (query.data && query.data.length > 0)) && (
          <>
            <div className="surface-card mt-6 flex flex-col gap-3 p-3 sm:flex-row">
              <label className="relative flex-1">
                <span className="sr-only">Search documents</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  className="form-input pl-10"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, purpose, or label"
                />
              </label>
              <select
                aria-label="Filter by category"
                className="form-input sm:w-44"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option className="capitalize" key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            {showArchived && (
              <p className="mt-4 text-sm text-muted">
                Documents remain recoverable here for 30 days. Restoration requires a connection.
              </p>
            )}
            <div className="mt-4 grid min-w-0 gap-2 md:grid-cols-2">
              {documents.map((document) => {
                const assignment =
                  document.assignment_mode === "selected"
                    ? "Selected travelers"
                    : document.assignment_mode === "unassigned"
                      ? "Assign later"
                      : "Shared";
                const content = (
                  <>
                    <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      {document.current_version ? (
                        <FileCheck2 className="size-4" />
                      ) : (
                        <FileText className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <h2 className="min-w-0 whitespace-normal break-words font-display text-base font-black leading-snug [overflow-wrap:anywhere]">
                        {document.title}
                      </h2>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-xs text-muted">
                          {documentPurposeLabel(document.purpose)} · {assignment}
                        </p>
                        <DocumentVisibilityBadge visibility={document.visibility} />
                      </div>
                      {document.sync_state === "queued" && (
                        <p
                          className={`mt-1.5 inline-flex items-center gap-1.5 text-[.65rem] font-bold uppercase tracking-[.1em] ${document.sync_error ? "text-warning" : "text-brand"}`}
                        >
                          <CloudUpload className="size-3" /> Saved on device ·{" "}
                          {document.sync_error ? "cloud action required" : "cloud pending"}
                        </p>
                      )}
                    </div>
                  </>
                );
                return showArchived ? (
                  <article
                    className="surface-card grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 p-3.5"
                    key={document.id}
                  >
                    {content}
                    <button
                      type="button"
                      disabled={restore.isPending}
                      onClick={() => restore.mutate(document)}
                      className="col-start-2 inline-flex items-center gap-2 text-xs font-bold text-brand"
                    >
                      <ArchiveRestore className="size-3.5" /> Restore
                    </button>
                  </article>
                ) : (
                  <Link
                    className="surface-card group grid min-w-0 max-w-full grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 overflow-hidden p-3.5 hover:border-brand/40"
                    to={`/trips/${document.trip_id}/documents/${document.id}`}
                    key={document.id}
                  >
                    {content}
                  </Link>
                );
              })}
            </div>
            {documents.length === 0 && (
              <div className="mt-5 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
                <FileSearch className="mx-auto mb-3 size-6" />
                {showArchived
                  ? "No recently deleted documents."
                  : "No documents match this search."}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
