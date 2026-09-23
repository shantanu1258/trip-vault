import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, CloudUpload, FileSearch, LockKeyhole, Search } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DocumentVisibilityIcon } from "../components/DocumentVisibilityIcon";
import { DocumentTypeIcon } from "../components/DocumentTypeIcon";
import { EmptyState, ErrorCard, LoadingCard } from "../components/TripUi";
import {
  listArchivedVaultDocuments,
  listVaultDocuments,
  restoreDocument
} from "../features/workspace/api";
import { documentMatchesTraveler, documentPurposeLabel } from "../features/workspace/documentModel";
import {
  documentCategoryCounts,
  documentFilterCategory
} from "../features/workspace/documentFilters";
import { tripQueries } from "../features/queries/tripQueries";
import { PersonalDocuments } from "../features/workspace/PersonalDocuments";

export function VaultPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const personal = params.get("section") === "personal";
  const queryClient = useQueryClient();
  const search = params.get("search") ?? "";
  const category = params.get("category") ?? "all";
  const travelerKey = params.get("traveler") ?? "all";
  const showArchived = params.get("archived") === "true";
  const updateFilters = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value && value !== "all") next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace: true, state: location.state });
  };
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
  const tripIds = [...new Set(source.map((document) => document.trip_id))].sort();
  const tripsQuery = useQuery({ ...tripQueries.trips(), enabled: !personal && tripIds.length > 0 });
  const travelersQueries = useQueries({
    queries: tripIds.map((tripId) => ({
      ...tripQueries.travelers(tripId),
      enabled: !personal
    }))
  });
  const bookingQueries = useQueries({
    queries: tripIds.map((tripId) => ({
      ...tripQueries.bookings(tripId),
      enabled:
        !personal &&
        source.some((document) => document.trip_id === tripId && document.category === "transport")
    }))
  });
  const bookings = bookingQueries.flatMap((query) => query.data ?? []);
  const travelerGroups = tripIds.map((tripId, index) => ({
    tripId,
    title:
      tripsQuery.data?.find((trip) => trip.id === tripId)?.title ?? `Trip ${tripId.slice(0, 8)}`,
    travelers: travelersQueries[index].data ?? []
  }));
  const selectedTraveler = travelerGroups
    .flatMap((group) => group.travelers)
    .find((traveler) => `${traveler.trip_id}:${traveler.id}` === travelerKey);
  const travelerDocuments = source.filter(
    (document) =>
      travelerKey === "all" ||
      (selectedTraveler &&
        document.trip_id === selectedTraveler.trip_id &&
        documentMatchesTraveler(document, selectedTraveler.id))
  );
  const documents = useMemo(
    () =>
      travelerDocuments.filter(
        (document) =>
          (category === "all" || documentFilterCategory(document, bookings) === category) &&
          `${document.title} ${document.purpose} ${document.short_label ?? ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
      ),
    [travelerDocuments, bookings, search, category]
  );
  const categories = documentCategoryCounts(travelerDocuments, bookings);
  const activeCategory =
    category === "all"
      ? undefined
      : (documentCategoryCounts(source, bookings).find((item) => item.key === category) ?? {
          key: category,
          label: category.replaceAll("_", " "),
          count: 0
        });
  const categoryOptions =
    activeCategory && !categories.some((item) => item.key === category)
      ? [...categories, { ...activeCategory, count: 0 }]
      : categories;
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
          <Link
            to={personal ? "/vault/add?section=personal" : "/vault/add"}
            className="primary-button shrink-0 px-3 py-2 text-xs"
          >
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
            onClick={() => updateFilters({ section: null })}
          >
            Trip documents
          </button>
          <button
            type="button"
            className={`min-h-11 whitespace-nowrap border-b-2 px-1 py-2 text-xs font-bold transition-colors min-[360px]:px-2 sm:px-3 sm:text-sm ${personal ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
            aria-pressed={personal}
            onClick={() => {
              updateFilters({ section: "personal" });
            }}
          >
            Personal documents
          </button>
          {!personal && (
            <button
              type="button"
              disabled={!navigator.onLine && !showArchived}
              onClick={() => {
                updateFilters({
                  archived: showArchived ? null : "true",
                  category: null,
                  traveler: null
                });
              }}
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
                <div className="mt-2 grid grid-cols-2 items-stretch gap-2">
                  <label className="relative min-w-0">
                    <span className="sr-only">Search documents</span>
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                    <input
                      className="form-input mt-0 min-w-0 pl-10"
                      value={search}
                      onChange={(event) => updateFilters({ search: event.target.value })}
                      placeholder="Search files"
                    />
                  </label>
                  <select
                    aria-label="Filter Vault documents by traveler"
                    className="form-input mt-0 min-w-0 truncate"
                    value={travelerKey}
                    onChange={(event) => updateFilters({ traveler: event.target.value })}
                  >
                    <option value="all">All travelers</option>
                    {travelerKey !== "all" && !selectedTraveler && (
                      <option value={travelerKey}>Traveler unavailable</option>
                    )}
                    {travelerGroups
                      .filter((group) => group.travelers.length > 0)
                      .map((group) => (
                        <optgroup key={group.tripId} label={group.title}>
                          {group.travelers.map((traveler) => (
                            <option key={traveler.id} value={`${group.tripId}:${traveler.id}`}>
                              {traveler.display_name} · {group.title}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                  </select>
                </div>
                <div
                  className="mt-2 flex min-w-0 gap-2 overflow-x-auto rounded-2xl border border-line bg-surface p-2"
                  role="group"
                  aria-label="Document types"
                >
                  {[
                    { key: "all", label: "All", count: travelerDocuments.length },
                    ...categoryOptions
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      aria-pressed={category === item.key}
                      onClick={() => updateFilters({ category: item.key })}
                      className={`inline-flex min-h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${category === item.key ? "bg-brand text-surface" : "bg-elevated text-brand hover:bg-brand-soft"}`}
                    >
                      {item.label} · {item.count}
                    </button>
                  ))}
                </div>
                {travelersQueries.some((query) => query.isLoading) && (
                  <p className="mt-2 text-xs text-muted">Loading travelers…</p>
                )}
                {(tripsQuery.isError || travelersQueries.some((query) => query.isError)) && (
                  <p className="mt-2 text-xs text-muted">
                    Some trip or traveler names could not be loaded. All available documents are
                    still accessible with All travelers.
                  </p>
                )}
                {bookingQueries.some((query) => query.isError) && (
                  <p className="mt-2 text-xs text-muted">
                    Some transport types could not be loaded; those files appear under Other
                    transport.
                  </p>
                )}
                {showArchived && (
                  <p className="mt-4 text-sm text-muted">
                    Documents remain recoverable here for 30 days. Restoration requires a
                    connection.
                  </p>
                )}
                <div className="mt-2 grid min-w-0 gap-2 md:grid-cols-2">
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
                            <DocumentVisibilityIcon
                              visibility={document.visibility}
                              documentTitle={document.title}
                            />
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
                      <div key={document.id} className="relative min-w-0">
                        <Link
                          className="surface-card group grid min-w-0 max-w-full grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5 overflow-hidden px-3 py-2.5 hover:border-brand/40"
                          to={`/trips/${document.trip_id}/documents/${document.id}`}
                        >
                          {content}
                        </Link>
                      </div>
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
