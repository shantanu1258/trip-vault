import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, CloudUpload, FileSearch, LockKeyhole, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DocumentVisibilityBadge } from "../components/DocumentVisibilityBadge";
import { DocumentTypeIcon } from "../components/DocumentTypeIcon";
import { EmptyState, ErrorCard, LoadingCard } from "../components/TripUi";
import {
  listArchivedVaultDocuments,
  listVaultDocuments,
  restoreDocument
} from "../features/workspace/api";
import { documentPurposeLabel } from "../features/workspace/documentModel";
import { PersonalDocuments } from "../features/workspace/PersonalDocuments";

export function VaultPage() {
  const [params, setParams] = useSearchParams();
  const personal = params.get("section") === "personal";
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
        <header className="page-enter flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="eyebrow">Secure files</p>
            <h1 className="mt-1 font-display text-xl font-black tracking-[-0.045em] min-[360px]:text-2xl sm:text-4xl">
              Document Vault
            </h1>
          </div>
          <Link to="/vault/add" className="primary-button shrink-0 px-3 py-2 text-xs">
            Add document
          </Link>
        </header>
        <div
          className="mt-4 flex items-center gap-2 border-b border-line"
          aria-label="Document sections"
        >
          <button
            type="button"
            className={`min-h-11 whitespace-nowrap border-b-2 px-1 py-2 text-xs font-bold transition-colors min-[360px]:px-2 sm:px-3 sm:text-sm ${personal ? "border-transparent text-muted hover:text-ink" : "border-brand text-brand"}`}
            aria-pressed={!personal}
            onClick={() => setParams({})}
          >
            Trip documents
          </button>
          <button
            type="button"
            className={`min-h-11 whitespace-nowrap border-b-2 px-1 py-2 text-xs font-bold transition-colors min-[360px]:px-2 sm:px-3 sm:text-sm ${personal ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
            aria-pressed={personal}
            onClick={() => setParams({ section: "personal" })}
          >
            Personal documents
          </button>
          {!personal && (
            <button
              type="button"
              disabled={!navigator.onLine && !showArchived}
              onClick={() => setShowArchived((value) => !value)}
              aria-label={showArchived ? "Current documents" : "Recently deleted"}
              title={showArchived ? "Current documents" : "Recently deleted"}
              aria-pressed={showArchived}
              className={`tap-target ml-auto grid size-11 shrink-0 place-items-center rounded-xl disabled:opacity-50 ${showArchived ? "bg-brand-soft text-brand" : "text-muted hover:bg-elevated hover:text-ink"}`}
            >
              <ArchiveRestore className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        {personal ? (
          <PersonalDocuments />
        ) : (
          <>
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
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
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
                    Documents remain recoverable here for 30 days. Restoration requires a
                    connection.
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
                        <DocumentTypeIcon type={document.category} emphasis="strong" />
                        <div className="min-w-0">
                          <h2 className="min-w-0 whitespace-normal break-words font-display text-sm font-bold leading-5 [overflow-wrap:anywhere]">
                            {document.title}
                          </h2>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
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
                        className="surface-card grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5 px-3 py-2.5"
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
                        className="surface-card group grid min-w-0 max-w-full grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5 overflow-hidden px-3 py-2.5 hover:border-brand/40"
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
          </>
        )}
      </div>
    </AppShell>
  );
}
