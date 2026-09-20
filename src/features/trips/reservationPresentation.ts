import { journeyRoute } from "../timeline/model";
import type { Booking, FlightLeg, JourneyLeg } from "../workspace/types";

export function groupByBookingId<T extends { booking_id: string }>(items: T[]) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const current = grouped.get(item.booking_id);
    if (current) current.push(item);
    else grouped.set(item.booking_id, [item]);
  }
  for (const group of grouped.values())
    group.sort((left, right) => {
      const leftOrder = "segment_order" in left ? Number(left.segment_order) : 0;
      const rightOrder = "segment_order" in right ? Number(right.segment_order) : 0;
      return leftOrder - rightOrder;
    });
  return grouped;
}

export function reservationRoute(
  booking: Booking,
  flightsByBooking: Map<string, FlightLeg[]>,
  journeysByBooking: Map<string, JourneyLeg[]>
) {
  const flights = flightsByBooking.get(booking.id) ?? [];
  if (flights.length)
    return journeyRoute(
      flights.map((leg) => ({
        origin: leg.departure_airport_code || leg.departure_airport_name,
        destination: leg.arrival_airport_code || leg.arrival_airport_name
      }))
    );
  const journeys = journeysByBooking.get(booking.id) ?? [];
  return journeyRoute(
    journeys.map((leg) => ({
      origin: leg.origin_code || leg.origin_name,
      destination: leg.destination_code || leg.destination_name
    }))
  );
}

export function reservationHref(tripId: string, booking: Booking, flights: FlightLeg[]) {
  const firstFlight = flights
    .filter((flight) => flight.booking_id === booking.id)
    .sort((left, right) => left.segment_order - right.segment_order)[0];
  return firstFlight
    ? `/trips/${tripId}/flights/${firstFlight.id}`
    : `/trips/${tripId}/bookings/${booking.id}`;
}

export type ReservationFilter =
  | "all"
  | "flight"
  | "hotel"
  | "train"
  | "bus"
  | "ferry"
  | "cab"
  | "transport"
  | "journey"
  | "plan";

export function matchesReservationFilter(type: string, filter: ReservationFilter) {
  if (filter === "all") return true;
  // Keep old shared links functional, but expose individual modes in new filters.
  if (filter === "journey") return ["train", "bus", "ferry", "cab", "transport"].includes(type);
  if (filter === "plan") return ["activity", "restaurant", "other"].includes(type);
  return type === filter;
}

export function bookingCategoryCounts(bookings: Booking[]) {
  return [
    { key: "flight", label: "Flights" },
    { key: "hotel", label: "Stays" },
    { key: "train", label: "Trains" },
    { key: "bus", label: "Buses" },
    { key: "ferry", label: "Ferries" },
    { key: "cab", label: "Cabs" },
    { key: "transport", label: "Other transport" },
    { key: "plan", label: "Plans" }
  ].map(({ key, label }) => ({
    key: key as ReservationFilter,
    label,
    count: bookings.filter((booking) =>
      matchesReservationFilter(booking.type, key as ReservationFilter)
    ).length
  }));
}
