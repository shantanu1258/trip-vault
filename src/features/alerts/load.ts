import { database } from "../../lib/local-db/database";
import { listAlertStates, listReminders, listTrips } from "../trips/api";
import { listFlightLegsForTrip, listRequirements, listVaultDocuments } from "../workspace/api";
import { localProfileId } from "../sync/localSync";

export async function loadAlertInputs() {
  const [trips, reminders, states, profileId] = await Promise.all([listTrips(), listReminders(), listAlertStates(), localProfileId()]);
  const [flightGroups, requirementGroups, documentGroups, offlineManifests, outbox] = await Promise.all([
    Promise.all(trips.map(async (trip) => (await listFlightLegsForTrip(trip.id)).map((flight) => ({ ...flight, trip_id: trip.id })))),
    Promise.all(trips.map((trip) => listRequirements(trip.id))),
    Promise.all(trips.map((trip) => listVaultDocuments(trip.id))),
    profileId ? database.offlineManifests.where("profileId").equals(profileId).toArray() : [],
    profileId ? database.outbox.where("profileId").equals(profileId).toArray() : []
  ]);
  return {
    trips,
    reminders,
    states,
    flights: flightGroups.flat(),
    requirements: requirementGroups.flat(),
    documents: documentGroups.flat(),
    offlineManifests,
    conflicts: outbox.filter((operation) => operation.lastErrorCode === "conflict" || operation.lastErrorCode === "version_conflict").map((operation) => ({ entityId: operation.entityId, entityType: operation.entityType }))
  };
}
