import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Plus, Search, TicketCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EmptyState, ErrorCard, LoadingCard, PageHeader } from "../components/TripUi";
import { tripQueries } from "../features/queries/tripQueries";
import {
  bookingCategoryCounts,
  groupByBookingId,
  reservationHref,
  reservationRoute
} from "../features/trips/reservationPresentation";
import { tripChildNavigationState, tripReturnNavigation } from "../features/trips/navigation";
import { ReservationRow } from "../features/trips/TripDetailsCards";
import { listTripBookingTravelers } from "../features/workspace/api";
import { readTravelerFocus } from "../features/workspace/travelerFocus";

type ReservationFilter = "all" | "flight" | "hotel" | "journey" | "plan";

function matchesFilter(type: string, filter: ReservationFilter) {
  if (filter === "all") return true;
  if (filter === "flight" || filter === "hotel") return type === filter;
  if (filter === "journey") return ["train", "bus", "ferry", "cab", "transport"].includes(type);
  return ["activity", "restaurant", "other"].includes(type);
}

export function TripReservationsPage() {
  const { tripId = "" } = useParams();
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ReservationFilter>("all");
  const [travelerId, setTravelerId] = useState(() => readTravelerFocus(tripId) ?? "all");
  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const bookingsQuery = useQuery({ ...tripQueries.bookings(tripId), enabled: Boolean(tripId) });
  const flightsQuery = useQuery({
    ...tripQueries.flights(tripId, bookingsQuery.data),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess
  });
  const journeysQuery = useQuery({
    ...tripQueries.journeys(tripId, bookingsQuery.data),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess
  });
  const documentsQuery = useQuery({ ...tripQueries.documents(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const bookingIds = (bookingsQuery.data ?? []).map((booking) => booking.id);
  const bookingTravelersQuery = useQuery({
    queryKey: ["booking-travelers", tripId, bookingIds],
    queryFn: () => listTripBookingTravelers(tripId, bookingIds),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess && travelerId !== "all"
  });
  const travelerBookingIds = useMemo(
    () =>
      new Set(
        (bookingTravelersQuery.data ?? [])
          .filter((row) => travelerId === "all" || row.traveler_id === travelerId)
          .map((row) => row.booking_id)
      ),
    [bookingTravelersQuery.data, travelerId]
  );
  const bookings = useMemo(
    () =>
      (bookingsQuery.data ?? []).filter(
        (booking) =>
          travelerId === "all" ||
          booking.participant_scope !== "selected" ||
          travelerBookingIds.has(booking.id)
      ),
    [bookingsQuery.data, travelerBookingIds, travelerId]
  );
  const flights = flightsQuery.data ?? [];
  const flightsByBooking = useMemo(() => groupByBookingId(flights), [flights]);
  const journeysByBooking = useMemo(
    () => groupByBookingId(journeysQuery.data ?? []),
    [journeysQuery.data]
  );
  const documentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documentsQuery.data ?? []) {
      if (!document.booking_id) continue;
      counts.set(document.booking_id, (counts.get(document.booking_id) ?? 0) + 1);
    }
    return counts;
  }, [documentsQuery.data]);
  const visibleBookings = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return bookings
      .filter(
        (booking) =>
          matchesFilter(booking.type, filter) &&
          (!normalized ||
            `${booking.title} ${booking.provider ?? ""} ${booking.reference_code ?? ""} ${reservationRoute(booking, flightsByBooking, journeysByBooking)}`
              .toLowerCase()
              .includes(normalized))
      )
      .sort((left, right) => {
        const leftTime = left.start_at
          ? new Date(left.start_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightTime = right.start_at
          ? new Date(right.start_at).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime || left.title.localeCompare(right.title);
      });
  }, [bookings, filter, flightsByBooking, journeysByBooking, search]);
  const counts = bookingCategoryCounts(bookings);
  const returnNavigation = tripReturnNavigation(location.state, tripId);
  const childState = tripChildNavigationState(location.state, tripId, "details");

  return (
    <AppShell>
      <div className="mx-auto min-w-0 max-w-5xl pb-24">
        <Link
          to={returnNavigation.href}
          state={returnNavigation.state}
          className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to trip details
        </Link>
        <div className="mt-4">
          <PageHeader
            eyebrow={tripQuery.data?.title ?? "Trip"}
            title="Reservations"
            text="Search every booking without turning Trip details into one long page."
            action={
              <Link
                className="primary-button"
                to={`/trips/${tripId}?view=details&add=event`}
                state={returnNavigation.state}
              >
                <Plus className="size-4" /> Add
              </Link>
            }
          />
        </div>
        {(tripQuery.isLoading || bookingsQuery.isLoading) && <LoadingCard />}
        {(tripQuery.error || bookingsQuery.error) && (
          <ErrorCard error={tripQuery.error ?? bookingsQuery.error} />
        )}
        {bookingsQuery.data && (
          <>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className={`rounded-full border px-3 py-2 text-xs font-black ${filter === "all" ? "border-brand bg-brand text-surface" : "border-line bg-surface text-muted"}`}
                onClick={() => setFilter("all")}
              >
                All {bookings.length}
              </button>
              {counts.map((count) => {
                const value: ReservationFilter =
                  count.label === "Flights"
                    ? "flight"
                    : count.label === "Stays"
                      ? "hotel"
                      : count.label === "Ground & water"
                        ? "journey"
                        : "plan";
                return (
                  <button
                    type="button"
                    key={count.label}
                    className={`rounded-full border px-3 py-2 text-xs font-black ${filter === value ? "border-brand bg-brand text-surface" : "border-line bg-surface text-muted"}`}
                    onClick={() => setFilter(value)}
                  >
                    {count.label} {count.count}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="relative block">
                <span className="sr-only">Search reservations</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  className="form-input pl-10"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search route, title, provider, or reference"
                />
              </label>
              <select
                className="form-input"
                aria-label="Filter reservations by traveler"
                value={travelerId}
                onChange={(event) => setTravelerId(event.target.value)}
              >
                <option value="all">All travelers</option>
                {(travelersQuery.data ?? []).map((traveler) => (
                  <option key={traveler.id} value={traveler.id}>
                    {traveler.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 space-y-2">
              {visibleBookings.map((booking) => (
                <ReservationRow
                  key={booking.id}
                  booking={booking}
                  href={reservationHref(tripId, booking, flights)}
                  route={reservationRoute(booking, flightsByBooking, journeysByBooking)}
                  documentCount={documentCounts.get(booking.id)}
                  navigationState={childState}
                />
              ))}
            </div>
            {!visibleBookings.length && (
              <EmptyState
                icon={<TicketCheck className="size-6" />}
                title="No matching reservations"
                text="Try another category or search term."
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
