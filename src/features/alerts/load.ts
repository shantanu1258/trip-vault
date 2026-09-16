import { queryOptions, type QueryClient } from "@tanstack/react-query";
import { database } from "../../lib/local-db/database";
import { listAlertStates, listItinerary, listReminders, listTrips } from "../trips/api";
import { listBookings, listFlightLegsForTrip, listRequirements, listVaultDocuments } from "../workspace/api";
import { localProfileId } from "../sync/localSync";
import { tripQueries } from "../queries/tripQueries";

export async function loadAlertInputs(queryClient?: QueryClient) {
  const [trips, reminders, states, profileId] = await Promise.all([
    queryClient ? queryClient.fetchQuery(tripQueries.trips()) : listTrips(),
    queryClient ? queryClient.fetchQuery(tripQueries.reminders()) : listReminders(),
    queryClient ? queryClient.fetchQuery(tripQueries.alertStates()) : listAlertStates(),
    localProfileId()
  ]);
  const [bookingGroups, requirementGroups, itineraryGroups, documentGroups, offlineManifests, outbox] = await Promise.all([
    Promise.all(trips.map((trip) => queryClient
      ? queryClient.fetchQuery(tripQueries.bookings(trip.id))
      : listBookings(trip.id))),
    Promise.all(trips.map((trip) => queryClient ? queryClient.fetchQuery(tripQueries.requirements(trip.id)) : listRequirements(trip.id))),
    Promise.all(trips.map((trip) => queryClient ? queryClient.fetchQuery(tripQueries.itinerary(trip.id)) : listItinerary(trip.id))),
    Promise.all(trips.map((trip) => queryClient ? queryClient.fetchQuery(tripQueries.documents(trip.id)) : listVaultDocuments(trip.id))),
    profileId ? database.offlineManifests.where("profileId").equals(profileId).toArray() : [],
    profileId ? database.outbox.where("profileId").equals(profileId).toArray() : []
  ]);
  const flightGroups = await Promise.all(trips.map(async (trip, index) => {
    const flights = queryClient
      ? await queryClient.fetchQuery(tripQueries.flights(trip.id, bookingGroups[index]))
      : await listFlightLegsForTrip(trip.id, bookingGroups[index]);
    return flights.map((flight) => ({ ...flight, trip_id: trip.id }));
  }));
  return {
    trips,
    reminders,
    states,
    flights: flightGroups.flat(),
    requirements: requirementGroups.flat(),
    itinerary: itineraryGroups.flat(),
    documents: documentGroups.flat(),
    offlineManifests,
    conflicts: outbox.filter((operation) => operation.lastErrorCode === "conflict" || operation.lastErrorCode === "version_conflict").map((operation) => ({ entityId: operation.entityId, entityType: operation.entityType }))
  };
}

export function alertInputsQueryOptions(queryClient: QueryClient) {
  return queryOptions({
    queryKey: ["alerts"] as const,
    queryFn: () => loadAlertInputs(queryClient),
    staleTime: 60_000
  });
}
