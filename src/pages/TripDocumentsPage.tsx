import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileSearch, Plus, Search } from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { TripDocumentRow } from "../components/TripDocumentRow";
import { EmptyState, ErrorCard, LoadingCard } from "../components/TripUi";
import { rankDocumentsForUpcomingEvents } from "../features/home/needNow";
import { tripQueries } from "../features/queries/tripQueries";
import { tripChildNavigationState, tripReturnNavigation } from "../features/trips/navigation";
import { useTripReturnScroll } from "../features/trips/returnScroll";
import { documentMatchesTraveler } from "../features/workspace/documentModel";
import {
  documentCategoryCounts,
  documentFilterCategory
} from "../features/workspace/documentFilters";
import { readTravelerFocus } from "../features/workspace/travelerFocus";

export function TripDocumentsPage() {
  const { tripId = "" } = useParams();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("search") ?? "";
  const setSearch = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("search", value);
    else next.delete("search");
    setSearchParams(next, { replace: true, state: location.state });
  };
  const category = searchParams.get("category") ?? "all";
  const setCategory = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("category");
    else next.set("category", value);
    setSearchParams(next, { replace: true, state: location.state });
  };
  const travelerId = searchParams.get("traveler") ?? readTravelerFocus(tripId) ?? "all";
  const setTravelerId = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("traveler", value);
    setSearchParams(next, { replace: true, state: location.state });
  };
  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ ...tripQueries.itinerary(tripId), enabled: Boolean(tripId) });
  const bookingsQuery = useQuery({ ...tripQueries.bookings(tripId), enabled: Boolean(tripId) });
  const flightsQuery = useQuery({
    ...tripQueries.flights(tripId, bookingsQuery.data),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess
  });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const documentsQuery = useQuery({ ...tripQueries.documents(tripId), enabled: Boolean(tripId) });
  const itineraryIds = (itineraryQuery.data ?? []).map((item) => item.id);
  const referencesQuery = useQuery({
    ...tripQueries.eventDocumentReferences(tripId, itineraryIds),
    enabled: Boolean(tripId) && itineraryQuery.isSuccess
  });
  const travelers = travelersQuery.data ?? [];
  const documents = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (documentsQuery.data ?? []).filter(
      (document) =>
        (category === "all" || documentFilterCategory(document, bookingsQuery.data) === category) &&
        (travelerId === "all" || documentMatchesTraveler(document, travelerId)) &&
        (!normalized ||
          `${document.title} ${document.purpose} ${document.short_label ?? ""}`
            .toLowerCase()
            .includes(normalized))
    );
  }, [category, documentsQuery.data, bookingsQuery.data, search, travelerId]);
  const ranked = useMemo(
    () =>
      rankDocumentsForUpcomingEvents({
        documents,
        itinerary: itineraryQuery.data,
        bookings: bookingsQuery.data,
        flights: flightsQuery.data,
        eventDocumentReferences: referencesQuery.data
      }),
    [bookingsQuery.data, documents, flightsQuery.data, itineraryQuery.data, referencesQuery.data]
  );
  const neededNext = ranked.filter((item) => Number.isFinite(item.occursAt)).slice(0, 3);
  const neededIds = new Set(neededNext.map((item) => item.document.id));
  const remaining = ranked.filter((item) => !neededIds.has(item.document.id));
  const categories = documentCategoryCounts(documentsQuery.data ?? [], bookingsQuery.data);
  const returnNavigation = tripReturnNavigation(location.state, tripId);
  const childState = tripChildNavigationState(location.state, tripId, "details");
  useTripReturnScroll(
    tripId,
    documentsQuery.isSuccess &&
      !itineraryQuery.isLoading &&
      !bookingsQuery.isLoading &&
      !flightsQuery.isLoading &&
      !travelersQuery.isLoading &&
      !referencesQuery.isLoading
  );

  return (
    <AppShell compactTop>
      <div className="mx-auto min-w-0 max-w-5xl pb-24">
        <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 py-1">
          <Link
            to={returnNavigation.href}
            state={returnNavigation.state}
            className="tap-target grid place-items-center text-muted hover:text-ink"
            aria-label="Back to trip details"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">Trip documents</h1>
            <p className="mt-0.5 truncate text-xs text-muted" title={tripQuery.data?.title}>
              {tripQuery.data?.title ?? "Trip"}
            </p>
          </div>
          <Link
            className="primary-button px-3 py-2 text-xs"
            to={`/trips/${tripId}?view=details&add=document`}
            state={returnNavigation.state}
          >
            <Plus className="size-4" /> Upload
          </Link>
        </header>
        {(tripQuery.isLoading || documentsQuery.isLoading) && <LoadingCard />}
        {(tripQuery.error || documentsQuery.error) && (
          <ErrorCard error={tripQuery.error ?? documentsQuery.error} />
        )}
        {documentsQuery.data && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_12rem]">
              <label className="relative col-span-2 sm:col-span-1">
                <span className="sr-only">Search trip documents</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  className="form-input pl-10"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search document names"
                />
              </label>
              <select
                className="form-input"
                aria-label="Filter documents by category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="all">All types</option>
                {categories.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
              <select
                className="form-input"
                aria-label="Filter documents by traveler"
                value={travelerId}
                onChange={(event) => setTravelerId(event.target.value)}
              >
                <option value="all">All travelers</option>
                {travelers.map((traveler) => (
                  <option key={traveler.id} value={traveler.id}>
                    {traveler.display_name}
                  </option>
                ))}
              </select>
            </div>

            {neededNext.length > 0 && (
              <section className="mt-6">
                <p className="eyebrow">Needed next</p>
                <div className="mt-3 space-y-2">
                  {neededNext.map((item) => (
                    <TripDocumentRow
                      key={item.document.id}
                      document={item.document}
                      travelers={travelers}
                      context={item.contextTitle}
                      to={`/trips/${tripId}/documents/${item.document.id}`}
                      state={childState}
                    />
                  ))}
                </div>
              </section>
            )}

            {(remaining.length > 0 || neededNext.length === 0) && (
              <section className="mt-7">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="eyebrow">
                      {neededNext.length ? "More files" : "All matching files"}
                    </p>
                    <h2 className="mt-1 font-display text-2xl font-black">
                      {neededNext.length ? "More documents" : "Documents"}
                    </h2>
                  </div>
                  <span className="text-sm font-bold text-muted">{documents.length}</span>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {remaining.map((item) => (
                    <TripDocumentRow
                      key={item.document.id}
                      document={item.document}
                      travelers={travelers}
                      context={item.contextTitle}
                      to={`/trips/${tripId}/documents/${item.document.id}`}
                      state={childState}
                    />
                  ))}
                </div>
                {!documents.length && (
                  <EmptyState
                    icon={<FileSearch className="size-6" />}
                    title="No matching documents"
                    text="Try another traveler, category, or search term."
                  />
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
