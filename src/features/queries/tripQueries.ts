import { queryOptions } from "@tanstack/react-query";
import {
  getTrip,
  listAlertStates,
  listCosts,
  listItinerary,
  listReminders,
  listTrips
} from "../trips/api";
import type { Booking } from "../workspace/types";
import {
  listBookings,
  listFlightLegsForTrip,
  listJourneyLegsForTrip,
  listMembers,
  listNotes,
  listRequirements,
  listTravelers,
  listVaultDocuments
} from "../workspace/api";
import {
  listCurrentAccountTravelerIds,
  listTripEventDocumentReferences
} from "../workspace/tripRelationships";

/**
 * Server data stays fresh through targeted mutation and Realtime invalidation.
 * A longer stale window therefore avoids re-downloading the same trip while a
 * user moves between Home, Timeline, Details, and child screens.
 */
export const TRIP_DATA_STALE_TIME = 5 * 60_000;

const sharedQueryPolicy = {
  staleTime: TRIP_DATA_STALE_TIME,
  gcTime: 30 * 60_000
};

export const tripQueries = {
  trips: () =>
    queryOptions({
      queryKey: ["trips"] as const,
      queryFn: () => listTrips(),
      ...sharedQueryPolicy
    }),
  trip: (tripId: string) =>
    queryOptions({
      queryKey: ["trip", tripId] as const,
      queryFn: () => getTrip(tripId),
      ...sharedQueryPolicy
    }),
  itinerary: (tripId: string) =>
    queryOptions({
      queryKey: ["itinerary", tripId] as const,
      queryFn: () => listItinerary(tripId),
      ...sharedQueryPolicy
    }),
  costs: (tripId: string) =>
    queryOptions({
      queryKey: ["costs", tripId] as const,
      queryFn: () => listCosts(tripId),
      ...sharedQueryPolicy
    }),
  bookings: (tripId: string) =>
    queryOptions({
      queryKey: ["bookings", tripId] as const,
      queryFn: () => listBookings(tripId),
      ...sharedQueryPolicy
    }),
  flights: (tripId: string, bookings?: Booking[]) =>
    queryOptions({
      queryKey: ["flights", tripId] as const,
      queryFn: () => listFlightLegsForTrip(tripId, bookings),
      ...sharedQueryPolicy
    }),
  journeys: (tripId: string, bookings?: Booking[]) =>
    queryOptions({
      queryKey: ["journey-legs", tripId] as const,
      queryFn: () => listJourneyLegsForTrip(tripId, bookings),
      ...sharedQueryPolicy
    }),
  travelers: (tripId: string) =>
    queryOptions({
      queryKey: ["travelers", tripId] as const,
      queryFn: () => listTravelers(tripId),
      ...sharedQueryPolicy
    }),
  members: (tripId: string) =>
    queryOptions({
      queryKey: ["members", tripId] as const,
      queryFn: () => listMembers(tripId),
      ...sharedQueryPolicy
    }),
  documents: (tripId: string) =>
    queryOptions({
      queryKey: ["documents", tripId] as const,
      queryFn: () => listVaultDocuments(tripId),
      ...sharedQueryPolicy
    }),
  currentAccountTravelerIds: (tripId: string, travelerIds: string[]) =>
    queryOptions({
      queryKey: ["current-traveler-accounts", tripId] as const,
      queryFn: () => listCurrentAccountTravelerIds(tripId, travelerIds),
      ...sharedQueryPolicy
    }),
  eventDocumentReferences: (tripId: string, itineraryItemIds: string[]) =>
    queryOptions({
      queryKey: ["trip-event-documents", tripId] as const,
      queryFn: () => listTripEventDocumentReferences(tripId, itineraryItemIds),
      ...sharedQueryPolicy
    }),
  requirements: (tripId: string) =>
    queryOptions({
      queryKey: ["requirements", tripId] as const,
      queryFn: () => listRequirements(tripId),
      ...sharedQueryPolicy
    }),
  notes: (tripId: string) =>
    queryOptions({
      queryKey: ["notes", tripId] as const,
      queryFn: () => listNotes(tripId),
      ...sharedQueryPolicy
    }),
  reminders: () =>
    queryOptions({
      queryKey: ["reminders"] as const,
      queryFn: () => listReminders(),
      ...sharedQueryPolicy
    }),
  alertStates: () =>
    queryOptions({
      queryKey: ["alert-states"] as const,
      queryFn: listAlertStates,
      ...sharedQueryPolicy
    })
};
