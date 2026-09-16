import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addTripCost: vi.fn(),
  equals: vi.fn(),
  where: vi.fn()
}));

vi.mock("../../lib/local-db/database", () => ({
  database: { outbox: { where: mocks.where } }
}));
vi.mock("../../lib/supabase/client", () => ({ supabase: null }));
vi.mock("../trips/api", () => ({ addItineraryItem: vi.fn(), addTripCost: mocks.addTripCost }));
vi.mock("../sync/localSync", () => ({
  cacheEntity: vi.fn(),
  cacheEntityList: vi.fn(),
  discardDocumentUploadOperations: vi.fn(),
  localProfileId: vi.fn(),
  networkWithCache: vi.fn(),
  queueAccountDocumentUpload: vi.fn(),
  queueCreate: vi.fn(),
  queueDelete: vi.fn(),
  queueDocumentAssociation: vi.fn(),
  queueDocumentUpload: vi.fn(),
  queueUpdate: vi.fn(),
  queueUpsert: vi.fn(),
  readEntityById: vi.fn(),
  readEntityList: vi.fn(),
  syncOutbox: vi.fn()
}));
vi.mock("../trips/participantSync", () => ({
  cacheParticipantAssignments: vi.fn(),
  queueBookingParticipantSync: vi.fn(),
  syncBookingParticipants: vi.fn()
}));
vi.mock("../metadata/publishedConfig", () => ({ listAvailableAirlines: vi.fn() }));

import { saveOptionalCostForCreatedEvent } from "./api";
import { COST_SAVE_WARNING } from "./creationCompletion";

describe("post-creation cost persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    mocks.where.mockReturnValue({ equals: mocks.equals });
    mocks.equals.mockImplementation((entityId: string) => ({
      filter: (predicate: (row: { operation: string }) => boolean) => ({
        first: () =>
          predicate({ operation: "create" })
            ? Promise.resolve({ operationId: `${entityId}-create` })
            : Promise.resolve(undefined)
      })
    }));
    mocks.addTripCost.mockResolvedValue({ id: "cost-1" });
  });

  it("queues cost behind both persisted rows it references", async () => {
    await expect(
      saveOptionalCostForCreatedEvent({
        tripId: "trip-1",
        bookingId: "booking-1",
        itineraryItemId: "item-1",
        title: "Ferry",
        category: "transport",
        amountMinor: 10_000,
        currencyCode: "INR",
        paymentStatus: "paid",
        dependsOn: ["explicit-parent"]
      })
    ).resolves.toBeUndefined();

    expect(mocks.addTripCost).toHaveBeenCalledWith(
      expect.objectContaining({
        dependsOn: ["explicit-parent", "booking-1-create", "item-1-create"]
      })
    );
  });

  it("returns a warning instead of failing after the core event exists", async () => {
    mocks.addTripCost.mockRejectedValue(new Error("cost insert failed"));

    await expect(
      saveOptionalCostForCreatedEvent({
        tripId: "trip-1",
        itineraryItemId: "item-1",
        title: "Museum",
        category: "activity",
        amountMinor: 2_500,
        currencyCode: "INR",
        paymentStatus: "planned"
      })
    ).resolves.toBe(COST_SAVE_WARNING);
  });
});
