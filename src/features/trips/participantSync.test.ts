import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  queueRpc: vi.fn(),
  readEntityList: vi.fn(),
  cacheEntityList: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("../sync/localSync", () => ({
  queueRpc: mocks.queueRpc,
  readEntityList: mocks.readEntityList,
  cacheEntityList: mocks.cacheEntityList
}));

import {
  bookingParticipantSyncArgs,
  cacheParticipantAssignments,
  queueBookingParticipantSync,
  syncBookingParticipants
} from "./participantSync";

describe("booking participant synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queueRpc.mockResolvedValue("operation-1");
    mocks.cacheEntityList.mockResolvedValue(undefined);
  });

  it("keeps selected-all explicit in the atomic RPC payload", async () => {
    const result = { booking: { id: "booking-1" }, itinerary_items: [{ id: "event-1" }] };
    mocks.rpc.mockResolvedValue({ data: result, error: null });

    await expect(
      syncBookingParticipants({
        bookingId: "booking-1",
        participantScope: "selected",
        travelerIds: ["asha", "ravi"]
      })
    ).resolves.toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledWith("sync_booking_participants", {
      requested_booking_id: "booking-1",
      requested_scope: "selected",
      requested_traveler_ids: ["asha", "ravi"],
      requested_itinerary_item_id: null,
      requested_itinerary_version: null
    });
  });

  it("queues the same atomic operation behind an offline parent edit", async () => {
    await queueBookingParticipantSync(
      { bookingId: "booking-1", participantScope: "everyone", travelerIds: [] },
      ["booking-update"]
    );

    expect(mocks.queueRpc).toHaveBeenCalledWith({
      entityType: "booking-participant-sync",
      entityId: "booking-1",
      functionName: "sync_booking_participants",
      args: bookingParticipantSyncArgs({
        bookingId: "booking-1",
        participantScope: "everyone",
        travelerIds: []
      }),
      dependsOn: ["booking-update"]
    });
  });

  it("replaces linked booking and event assignments without touching other cached trips items", async () => {
    mocks.readEntityList.mockImplementation(async (key: string) =>
      key.startsWith("booking-travelers")
        ? [
            { id: "other:ravi", booking_id: "other", traveler_id: "ravi" },
            { id: "booking-1:old", booking_id: "booking-1", traveler_id: "old" }
          ]
        : [
            { id: "other-event:ravi", itinerary_item_id: "other-event", traveler_id: "ravi" },
            { id: "event-1:old", itinerary_item_id: "event-1", traveler_id: "old" }
          ]
    );

    await cacheParticipantAssignments({
      tripId: "trip-1",
      bookingId: "booking-1",
      itineraryItemIds: ["event-1", "event-2"],
      participantScope: "selected",
      travelerIds: ["asha"]
    });

    expect(mocks.cacheEntityList).toHaveBeenCalledWith("booking-travelers:trip-1", [
      { id: "other:ravi", booking_id: "other", traveler_id: "ravi" },
      { id: "booking-1:asha", booking_id: "booking-1", traveler_id: "asha" }
    ]);
    expect(mocks.cacheEntityList).toHaveBeenCalledWith("itinerary-participants:trip-1", [
      { id: "other-event:ravi", itinerary_item_id: "other-event", traveler_id: "ravi" },
      { id: "event-1:asha", itinerary_item_id: "event-1", traveler_id: "asha" },
      { id: "event-2:asha", itinerary_item_id: "event-2", traveler_id: "asha" }
    ]);
  });
});
