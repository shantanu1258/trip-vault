import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ plans: vi.fn(), moments: vi.fn(), put: vi.fn() }));
vi.mock("../planning/api", () => ({ listPlanningItems: mocks.plans }));
vi.mock("../activity-moments/api", () => ({ listActivityMoments: mocks.moments }));
vi.mock("../sync/localSync", () => ({ localProfileId: async () => "me" }));
vi.mock("../../lib/local-db/database", () => ({
  database: {
    offlineManifests: { put: mocks.put },
    localDocuments: { where: () => ({ equals: () => ({ toArray: async () => [] }) }) }
  }
}));
vi.mock("../../lib/storage/offlineFiles", () => ({
  storageEstimate: async () => ({ quota: 1000000, usage: 0 }),
  requestPersistentStorage: async () => true,
  storeOfflineFile: vi.fn(),
  removeOfflineFile: vi.fn()
}));
vi.mock("../trips/api", () => ({
  listItinerary: async () => [
    { id: "plan", event_type: "preparation" },
    { id: "activity", event_type: "activity" },
    { id: "flight", event_type: "flight" }
  ],
  listCosts: async () => [],
  listAlertStates: async () => [],
  listReminders: async () => []
}));
vi.mock("../workspace/api", () =>
  Object.fromEntries(
    [
      "cacheTripRelationships",
      "listEventDocumentLinks",
      "listBookings",
      "listFlightLegsForTrip",
      "listFlightTravelers",
      "listJourneyLegsForTrip",
      "listJourneyLegTravelersForTrip",
      "listMembers",
      "listNotes",
      "listRequirements",
      "listTravelerManagers",
      "listTravelers",
      "listTripAirlines",
      "listTripBookingTravelers",
      "listTripItineraryParticipants",
      "listTripRequirementAssignees",
      "listVaultDocuments",
      "downloadDocumentVersion"
    ].map((name) => [name, async () => []])
  )
);
import { prepareTripOffline } from "./offlinePack";
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.plans.mockResolvedValue([]);
  mocks.moments.mockResolvedValue([]);
});
it("caches plans and activity Moments before marking the trip ready for offline use", async () => {
  expect((await prepareTripOffline("trip")).state).toBe("ready");
  expect(mocks.plans).toHaveBeenCalledOnce();
  expect(mocks.plans).toHaveBeenCalledWith("plan");
  expect(mocks.moments).toHaveBeenCalledOnce();
  expect(mocks.moments).toHaveBeenCalledWith("activity");
});
it("does not claim the trip is ready if agenda data cannot be downloaded", async () => {
  mocks.moments.mockRejectedValue(new Error("Unable to load Moments"));
  await expect(prepareTripOffline("trip")).rejects.toThrow("Unable to load Moments");
  expect(mocks.put).toHaveBeenLastCalledWith(expect.objectContaining({ state: "failed" }));
});
