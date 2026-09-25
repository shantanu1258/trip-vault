import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArchiveRestore,
  ChevronDown,
  CloudUpload,
  FileSearch,
  LockKeyhole,
  Map,
  Search,
  SlidersHorizontal,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
import { listReminders } from "../features/trips/api";
import { tripActivitySpan } from "../features/workspace/activeTrip";

export function VaultPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const personal = params.get("section") === "personal";
  const queryClient = useQueryClient();
  const search = params.get("search") ?? "";
  const category = params.get("category") ?? "all";
  const travelerKey = params.get("traveler") ?? "all";
  const selectedTripId = params.get("trip") ?? "all";
  const eventId = params.get("event") ?? "all";
  const showArchived = params.get("archived") === "true";
  const [filtersOpen, setFiltersOpen] = useState(false);
  const updateFilters = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value && (value !== "all" || key === "trip")) next.set(key, value);
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
  const tripsQuery = useQuery({ ...tripQueries.trips(), enabled: !personal });
  const availableTrips = (tripsQuery.data ?? []).filter(
    (trip) => !trip.deleted_at && trip.status !== "archived"
  );
  const checkingActiveTrip = !personal && !params.has("trip") && travelerKey === "all";
  const itineraryQueries = useQueries({
    queries: availableTrips.map((trip) => ({
      ...tripQueries.itinerary(trip.id),
      enabled: checkingActiveTrip
    }))
  });
  const requirementQueries = useQueries({
    queries: availableTrips.map((trip) => ({
      ...tripQueries.requirements(trip.id),
      enabled: checkingActiveTrip
    }))
  });
  const reminders = useQuery({
    queryKey: ["reminders", "including-completed"],
    queryFn: () => listReminders(true),
    enabled: checkingActiveTrip
  });
  useEffect(() => {
    if (personal || params.has("trip") || !tripsQuery.isSuccess) return;
    // Old bookmarked traveler filters already identify their trip.
    if (travelerKey !== "all") {
      updateFilters({ trip: travelerKey.split(":")[0] });
      return;
    }
    if (
      reminders.isPending ||
      [...itineraryQueries, ...requirementQueries].some((query) => query.isPending)
    )
      return;
    if (
      reminders.isError ||
      [...itineraryQueries, ...requirementQueries].some((query) => query.isError)
    )
      return;
    const now = Date.now();
    const active = availableTrips
      .map((trip, index) => ({
        trip,
        span: tripActivitySpan({
          tripId: trip.id,
          events: itineraryQueries[index].data ?? [],
          requirements: requirementQueries[index].data ?? [],
          reminders: reminders.data ?? [],
          timezone: trip.primary_timezone
        })
      }))
      .filter((entry) => entry.span && now >= entry.span.start && now <= entry.span.end)
      .sort(
        (a, b) =>
          b.span!.start - a.span!.start ||
          (b.trip.created_at ?? "").localeCompare(a.trip.created_at ?? "") ||
          a.trip.id.localeCompare(b.trip.id)
      );
    updateFilters({ trip: active[0]?.trip.id ?? "all" });
  });
  const tripSource = source.filter(
    (document) => selectedTripId === "all" || document.trip_id === selectedTripId
  );
  const eventsQuery = useQuery({
    ...tripQueries.itinerary(selectedTripId),
    enabled: !personal && selectedTripId !== "all"
  });
  const events = (eventsQuery.data ?? [])
    .filter((event) => !event.deleted_at)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const referencesQuery = useQuery({
    ...tripQueries.eventDocumentReferences(
      selectedTripId,
      events.map((event) => event.id)
    ),
    enabled: !personal && selectedTripId !== "all" && eventsQuery.isSuccess
  });
  const selectedEvent = events.find((event) => event.id === eventId);
  const eventDocumentIds = new Set(
    (referencesQuery.data ?? [])
      .filter((link) => link.itinerary_item_id === eventId)
      .map((link) => link.document_id)
  );
  // Match the event detail page: explicit attachments plus its booking's documents.
  const eventSource = tripSource.filter(
    (document) =>
      eventId === "all" ||
      (selectedEvent &&
        (eventDocumentIds.has(document.id) ||
          (selectedEvent.booking_id && document.booking_id === selectedEvent.booking_id)))
  );
  const tripIds = [
    ...new Set([
      ...availableTrips.map((trip) => trip.id),
      ...source.map((document) => document.trip_id)
    ])
  ]
    .filter((id) => selectedTripId === "all" || id === selectedTripId)
    .sort();
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
  const travelerDocuments = eventSource.filter(
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
  const activeFilters = [
    ...(eventId !== "all"
      ? [{ key: "event", label: selectedEvent?.title ?? "Selected event" }]
      : []),
    ...(travelerKey !== "all"
      ? [{ key: "traveler", label: selectedTraveler?.display_name ?? "Selected traveller" }]
      : [])
  ];
  return (
    <AppShell compactTop>
      <div className="mx-auto min-w-0 max-w-5xl">
        <header className="page-enter flex items-center justify-between gap-2 py-1">
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl">
              Document Vault
            </h1>
            {!personal && (showArchived || (query.data && query.data.length > 0)) && (
              <div className="relative mt-0.5 inline-block min-w-0 max-w-full align-top">
                <Map
                  className="pointer-events-none absolute left-0 top-1/2 size-3.5 -translate-y-1/2 text-brand"
                  aria-hidden="true"
                />
                <select
                  aria-label="Filter Vault documents by trip"
                  title={
                    tripsQuery.data?.find((trip) => trip.id === selectedTripId)?.title ??
                    "All trips"
                  }
                  className="block min-h-8 w-auto min-w-0 max-w-full cursor-pointer [field-sizing:content] appearance-none truncate rounded-md bg-transparent pl-5 pr-6 text-sm font-semibold text-brand hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  value={selectedTripId}
                  onChange={(event) =>
                    updateFilters({ trip: event.target.value, traveler: null, event: null })
                  }
                >
                  <option value="all">All trips</option>
                  {[
                    ...new Set([
                      ...availableTrips.map((trip) => trip.id),
                      ...source.map((document) => document.trip_id),
                      ...(selectedTripId !== "all" ? [selectedTripId] : [])
                    ])
                  ].map((id) => (
                    <option key={id} value={id}>
                      {tripsQuery.data?.find((trip) => trip.id === id)?.title ??
                        `Trip ${id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 text-brand"
                  aria-hidden="true"
                />
              </div>
            )}
          </div>
          <Link
            to={
              personal
                ? "/vault/add?section=personal"
                : selectedTripId !== "all"
                  ? `/vault/add?trip=${encodeURIComponent(selectedTripId)}`
                  : "/vault/add"
            }
            className="primary-button shrink-0 px-3 py-2 text-xs"
          >
            Add document
          </Link>
        </header>
        <div
          className="mt-2 flex items-center gap-2 border-b border-line"
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
                <div className="mt-3 flex items-stretch gap-2">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">Search documents</span>
                    <Search
                      className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted"
                      aria-hidden="true"
                    />
                    <input
                      className="form-input mt-0 min-w-0 pl-10"
                      value={search}
                      onChange={(event) => updateFilters({ search: event.target.value })}
                      placeholder="Search files"
                    />
                  </label>
                  <button
                    type="button"
                    aria-label="Filters"
                    aria-expanded={filtersOpen}
                    aria-controls="vault-filters"
                    onClick={() => setFiltersOpen(!filtersOpen)}
                    className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold ${filtersOpen || activeFilters.length ? "border-brand/40 text-brand" : "border-line text-muted hover:text-ink"}`}
                  >
                    <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
                    {activeFilters.length > 0 && (
                      <span aria-hidden="true" className="text-xs">
                        {activeFilters.length}
                      </span>
                    )}
                  </button>
                </div>
                <div id="vault-filters" hidden={!filtersOpen}>
                  <div className="mt-2 grid grid-cols-2 gap-3 rounded-xl border border-line bg-surface p-3">
                    <label className="min-w-0 text-xs font-semibold text-muted">
                      Event
                      <span className="relative mt-1 block">
                        <select
                          aria-label="Filter Vault documents by event"
                          title={selectedEvent?.title ?? "All events"}
                          className="form-input mt-0 min-w-0 appearance-none truncate pr-10 disabled:opacity-50"
                          value={eventId}
                          disabled={selectedTripId === "all" || eventsQuery.isPending}
                          onChange={(event) => updateFilters({ event: event.target.value })}
                        >
                          <option value="all">
                            {selectedTripId === "all" ? "Choose a trip first" : "All events"}
                          </option>
                          {eventId !== "all" && !selectedEvent && (
                            <option value={eventId}>Event unavailable</option>
                          )}
                          {events.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.title}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          aria-hidden="true"
                          className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted ${selectedTripId === "all" || eventsQuery.isPending ? "opacity-50" : ""}`}
                        />
                      </span>
                    </label>
                    <label className="min-w-0 text-xs font-semibold text-muted">
                      Traveller
                      <span className="relative mt-1 block">
                        <select
                          aria-label="Filter Vault documents by traveler"
                          className="form-input mt-0 min-w-0 appearance-none truncate pr-10"
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
                                  <option
                                    key={traveler.id}
                                    value={`${group.tripId}:${traveler.id}`}
                                  >
                                    {traveler.display_name}
                                    {selectedTripId === "all" ? ` · ${group.title}` : ""}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                        </select>
                        <ChevronDown
                          aria-hidden="true"
                          className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                        />
                      </span>
                    </label>
                  </div>
                </div>
                {!filtersOpen && activeFilters.length > 0 && (
                  <div
                    className="mt-2 flex flex-wrap items-center gap-1"
                    aria-label="Applied filters"
                  >
                    {activeFilters.map((filter) => (
                      <button
                        key={filter.key}
                        type="button"
                        title={filter.label}
                        aria-label={`Remove ${filter.label} filter`}
                        onClick={() => updateFilters({ [filter.key]: null })}
                        className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-lg px-2 text-xs text-muted hover:bg-elevated hover:text-ink"
                      >
                        <span className="truncate">{filter.label}</span>
                        <X className="size-3 shrink-0" aria-hidden="true" />
                      </button>
                    ))}
                    <button
                      type="button"
                      className="min-h-9 px-2 text-xs font-bold text-brand"
                      onClick={() => updateFilters({ event: null, traveler: null })}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                <div
                  className="-mx-1 mt-2 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
                      className={`inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand ${category === item.key ? "bg-brand text-surface" : "bg-elevated text-brand hover:bg-brand-soft"}`}
                    >
                      {item.label} · {item.count}
                    </button>
                  ))}
                </div>
                {selectedTripId !== "all" && (eventsQuery.isError || referencesQuery.isError) && (
                  <p role="status" className="mt-2 text-xs text-muted">
                    Some event links could not be loaded. Choose All events to see all available
                    trip documents.
                  </p>
                )}
                {eventId !== "all" && referencesQuery.isFetching && (
                  <p role="status" className="mt-2 text-xs text-muted">
                    Loading event documents…
                  </p>
                )}
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
