import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTrips: vi.fn(),
  listReminders: vi.fn(),
  listAlertStates: vi.fn(),
  listBookings: vi.fn(),
  listFlightLegsForTrip: vi.fn(),
  listRequirements: vi.fn(),
  listItinerary: vi.fn(),
  listVaultDocuments: vi.fn()
}));

vi.mock("../trips/api", () => ({
  listTrips: mocks.listTrips,
  listReminders: mocks.listReminders,
  listAlertStates: mocks.listAlertStates,
  listItinerary: mocks.listItinerary,
  getTrip: vi.fn(),
  listCosts: vi.fn()
}));
vi.mock("../workspace/api", () => ({
  listBookings: mocks.listBookings,
  listFlightLegsForTrip: mocks.listFlightLegsForTrip,
  listJourneyLegsForTrip: vi.fn(),
  listRequirements: mocks.listRequirements,
  listVaultDocuments: mocks.listVaultDocuments,
  listTravelers: vi.fn(),
  listMembers: vi.fn(),
  listNotes: vi.fn()
}));
vi.mock("../sync/localSync", () => ({ localProfileId: vi.fn().mockResolvedValue("profile-1") }));
vi.mock("../../lib/local-db/database", () => {
  const toArray = vi.fn().mockResolvedValue([]);
  return { database: { offlineManifests: { where: () => ({ equals: () => ({ toArray }) }) }, outbox: { where: () => ({ equals: () => ({ toArray }) }) } } };
});

import { loadAlertInputs } from "./load";

describe("loadAlertInputs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTrips.mockResolvedValue([{ id: "trip-1" }]);
    mocks.listReminders.mockResolvedValue([]);
    mocks.listAlertStates.mockResolvedValue([]);
    mocks.listBookings.mockResolvedValue([{ id: "booking-1", type: "flight" }]);
    mocks.listFlightLegsForTrip.mockResolvedValue([]);
    mocks.listRequirements.mockResolvedValue([]);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listVaultDocuments.mockResolvedValue([]);
  });

  it("reuses shared trip queries while recomputing time-sensitive alerts", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await loadAlertInputs(queryClient);
    await loadAlertInputs(queryClient);

    expect(mocks.listTrips).toHaveBeenCalledOnce();
    expect(mocks.listBookings).toHaveBeenCalledOnce();
    expect(mocks.listFlightLegsForTrip).toHaveBeenCalledOnce();
    expect(mocks.listFlightLegsForTrip).toHaveBeenCalledWith("trip-1", [{ id: "booking-1", type: "flight" }]);
    expect(mocks.listRequirements).toHaveBeenCalledOnce();
    expect(mocks.listItinerary).toHaveBeenCalledOnce();
    expect(mocks.listVaultDocuments).toHaveBeenCalledOnce();
  });

  it("refetches a shared query after a mutation invalidates it", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await loadAlertInputs(queryClient);
    await queryClient.invalidateQueries({ queryKey: ["bookings", "trip-1"], refetchType: "none" });
    await loadAlertInputs(queryClient);

    expect(mocks.listBookings).toHaveBeenCalledTimes(2);
    expect(mocks.listFlightLegsForTrip).toHaveBeenCalledOnce();
  });
});
