import { database, type OfflineManifest } from "../../lib/local-db/database";
import {
  removeOfflineFile,
  requestPersistentStorage,
  storageEstimate,
  storeOfflineFile
} from "../../lib/storage/offlineFiles";
import { listAlertStates, listCosts, listItinerary, listReminders } from "../trips/api";
import { localProfileId } from "../sync/localSync";
import { listPlanningItems } from "../planning/api";
import { listActivityMoments } from "../activity-moments/api";
import {
  cacheTripRelationships,
  downloadDocumentVersion,
  listBookings,
  listEventDocumentLinks,
  listFlightLegsForTrip,
  listFlightTravelers,
  listJourneyLegsForTrip,
  listJourneyLegTravelersForTrip,
  listMembers,
  listNotes,
  listRequirements,
  listTravelerManagers,
  listTravelers,
  listTripAirlines,
  listTripBookingTravelers,
  listTripItineraryParticipants,
  listTripRequirementAssignees,
  listVaultDocuments
} from "../workspace/api";

export function calculatePackState(
  expectedVersionIds: string[],
  verifiedVersionIds: string[],
  essentials = false
): OfflineManifest["state"] {
  if (!expectedVersionIds.length) return "ready";
  if (expectedVersionIds.every((id) => verifiedVersionIds.includes(id)))
    return essentials ? "essentials_ready" : "ready";
  return "failed";
}

export function missingPackBytes(
  documents: { current_version?: { id: string; byte_size: number } | null }[],
  verifiedIds: string[]
) {
  return documents.reduce(
    (total, document) =>
      document.current_version && !verifiedIds.includes(document.current_version.id)
        ? total + Number(document.current_version.byte_size)
        : total,
    0
  );
}

export async function getOfflineManifest(tripId: string) {
  const profileId = await localProfileId();
  if (!profileId) return undefined;
  return database.offlineManifests.get([profileId, tripId]);
}

export async function prepareTripOffline(
  tripId: string,
  onProgress?: (complete: number, total: number) => void,
  essentialsOnly = false
) {
  const profileId = await localProfileId();
  if (!profileId) throw new Error("Sign in online once before preparing a trip.");
  if (!navigator.onLine) throw new Error("Reconnect to prepare or refresh an offline trip.");
  const preparing: OfflineManifest = {
    profileId,
    tripId,
    state: "preparing",
    expectedVersionIds: [],
    verifiedVersionIds: [],
    checkedAt: new Date().toISOString()
  };
  await database.offlineManifests.put(preparing);
  let expectedVersionIds: string[] = [];
  let verified: string[] = [];
  try {
    const [itinerary, , bookings, flights, journeys, travelers, requirements] = await Promise.all([
      listItinerary(tripId),
      listCosts(tripId),
      listBookings(tripId),
      listFlightLegsForTrip(tripId),
      listJourneyLegsForTrip(tripId),
      listTravelers(tripId),
      listRequirements(tripId),
      listMembers(tripId),
      listTravelerManagers(tripId),
      listNotes(tripId),
      listTripAirlines(tripId),
      listReminders(),
      listAlertStates()
    ]);
    await Promise.all([
      ...itinerary.map((item) => listEventDocumentLinks(item.id)),
      ...itinerary
        .filter((item) => item.event_type === "preparation")
        .map((item) => listPlanningItems(item.id)),
      ...itinerary
        .filter((item) => item.event_type === "activity")
        .map((item) => listActivityMoments(item.id)),
      ...flights.map((flight) => listFlightTravelers(flight.id)),
      listJourneyLegTravelersForTrip(
        tripId,
        journeys.map((leg) => leg.id)
      ),
      listTripItineraryParticipants(
        tripId,
        itinerary.map((item) => item.id)
      ),
      listTripBookingTravelers(
        tripId,
        bookings.map((booking) => booking.id)
      ),
      listTripRequirementAssignees(
        tripId,
        requirements.map((requirement) => requirement.id)
      )
    ]);
    await cacheTripRelationships(tripId, itinerary, bookings, requirements, travelers);
    const allDocuments = await listVaultDocuments(tripId);
    const documents = essentialsOnly
      ? allDocuments.filter((document) =>
          ["boarding_pass", "ticket", "visa", "arrival_card", "passport", "insurance"].includes(
            document.purpose
          )
        )
      : allDocuments;
    expectedVersionIds = documents.flatMap((document) =>
      document.current_version ? [document.current_version.id] : []
    );
    if (documents.some((document) => !document.current_version)) {
      const failed = {
        ...preparing,
        state: "failed" as const,
        expectedVersionIds,
        checkedAt: new Date().toISOString()
      };
      await database.offlineManifests.put(failed);
      return failed;
    }
    const localRows = await database.localDocuments.where("profileId").equals(profileId).toArray();
    verified = localRows
      .filter((row) => expectedVersionIds.includes(row.documentVersionId) && row.verifiedAt)
      .map((row) => row.documentVersionId);
    const estimate = await storageEstimate();
    const required = missingPackBytes(documents, verified);
    if (estimate.quota && estimate.quota - estimate.usage < required) {
      const insufficient = {
        ...preparing,
        state: "insufficient_space" as const,
        expectedVersionIds,
        verifiedVersionIds: verified,
        checkedAt: new Date().toISOString()
      };
      await database.offlineManifests.put(insufficient);
      return insufficient;
    }
    await requestPersistentStorage().catch(() => false);
    let complete = 0;
    onProgress?.(complete, expectedVersionIds.length);
    for (const document of documents) {
      const version = document.current_version!;
      if (!verified.includes(version.id)) {
        const blob = await downloadDocumentVersion(document);
        await storeOfflineFile({
          profileId,
          versionId: version.id,
          blob,
          sha256: version.sha256,
          pinReason: "trip"
        });
        verified.push(version.id);
      }
      complete += 1;
      onProgress?.(complete, expectedVersionIds.length);
    }
    const manifest: OfflineManifest = {
      profileId,
      tripId,
      state: calculatePackState(expectedVersionIds, verified, essentialsOnly),
      expectedVersionIds,
      verifiedVersionIds: verified,
      checkedAt: new Date().toISOString()
    };
    await database.offlineManifests.put(manifest);
    return manifest;
  } catch (error) {
    await database.offlineManifests.put({
      ...preparing,
      state: "failed",
      expectedVersionIds,
      verifiedVersionIds: verified,
      checkedAt: new Date().toISOString()
    });
    throw error;
  }
}

export async function removeTripOffline(tripId: string) {
  const profileId = await localProfileId();
  if (!profileId) return;
  const manifest = await database.offlineManifests.get([profileId, tripId]);
  if (manifest) {
    const records = await database.localDocuments.where("profileId").equals(profileId).toArray();
    for (const record of records.filter(
      (item) =>
        manifest.expectedVersionIds.includes(item.documentVersionId) && item.pinReason === "trip"
    ))
      await removeOfflineFile(profileId, record.documentVersionId);
  }
  await database.offlineManifests.delete([profileId, tripId]);
}

export async function listOfflinePacks() {
  const profileId = await localProfileId();
  if (!profileId) return [];
  const [manifests, tripRows] = await Promise.all([
    database.offlineManifests.where("profileId").equals(profileId).toArray(),
    database.entities.where("[profileId+entityType]").equals([profileId, "trips"]).toArray()
  ]);
  const titles = new Map(
    tripRows.map((row) => [row.id, (row.data as { title?: string }).title ?? "Trip"])
  );
  return manifests.map((manifest) => ({
    ...manifest,
    title: titles.get(manifest.tripId) ?? "Prepared trip"
  }));
}
