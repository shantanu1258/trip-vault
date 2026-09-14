import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  cacheEntity: vi.fn(),
  cacheEntityList: vi.fn(),
  readEntityList: vi.fn(),
  syncBookingParticipants: vi.fn(),
  cacheParticipantAssignments: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("../sync/localSync", () => ({
  cacheEntity: mocks.cacheEntity,
  cacheEntityList: mocks.cacheEntityList,
  discardDocumentUploadOperations: vi.fn(),
  localProfileId: vi.fn().mockResolvedValue("user-1"),
  networkWithCache: vi.fn(),
  queueAccountDocumentUpload: vi.fn(),
  queueCreate: vi.fn(),
  queueDelete: vi.fn(),
  queueDocumentAssociation: vi.fn(),
  queueDocumentUpload: vi.fn(),
  queueUpdate: vi.fn(),
  queueUpsert: vi.fn(),
  readEntityById: vi.fn(),
  readEntityList: mocks.readEntityList,
  syncOutbox: vi.fn()
}));
vi.mock("../trips/participantSync", () => ({
  syncBookingParticipants: mocks.syncBookingParticipants,
  cacheParticipantAssignments: mocks.cacheParticipantAssignments,
  queueBookingParticipantSync: vi.fn()
}));

import { updateBooking } from "./api";
import type { Booking } from "./types";

const existing: Booking = {
  id: "booking-1",
  trip_id: "trip-1",
  type: "activity",
  title: "Museum visit",
  provider: "Museum",
  reference_code: "ABC",
  start_at: "2026-09-28T04:00:00.000Z",
  end_at: null,
  source_timezone: "Asia/Dubai",
  location: null,
  details: {},
  reservation_state: "booked",
  participant_scope: "everyone",
  version: 4,
  created_at: "2026-09-01T00:00:00.000Z"
};

describe("booking/event participant edits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.readEntityList.mockResolvedValue([]);
    mocks.cacheEntity.mockResolvedValue(undefined);
    mocks.cacheEntityList.mockResolvedValue(undefined);
    mocks.cacheParticipantAssignments.mockResolvedValue(undefined);

    const getRequest: Record<string, unknown> = {};
    getRequest.eq = vi.fn(() => getRequest);
    getRequest.is = vi.fn(() => getRequest);
    getRequest.single = vi.fn().mockResolvedValue({ data: existing, error: null });

    const updateRequest: Record<string, unknown> = {};
    updateRequest.eq = vi.fn(() => updateRequest);
    updateRequest.select = vi.fn(() => updateRequest);
    updateRequest.maybeSingle = vi.fn().mockResolvedValue({ data: { ...existing, title: "Museum visit updated", version: 5 }, error: null });

    const travelerRequest: Record<string, unknown> = {};
    travelerRequest.eq = vi.fn().mockResolvedValue({ data: [], error: null });

    const bookingUpdate = vi.fn(() => updateRequest);
    mocks.from.mockImplementation((table: string) => {
      if (table === "bookings") return { select: vi.fn(() => getRequest), update: bookingUpdate };
      if (table === "booking_travelers") return { select: vi.fn(() => travelerRequest) };
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.syncBookingParticipants.mockResolvedValue({
      booking: { ...existing, title: "Museum visit updated", participant_scope: "selected", version: 6 },
      itinerary_items: [
        { id: "event-1", trip_id: "trip-1", booking_id: "booking-1", applies_to_all_travelers: false },
        { id: "event-2", trip_id: "trip-1", booking_id: "booking-1", applies_to_all_travelers: false }
      ]
    });
  });

  it("commits the booking and every linked event roster through one participant RPC", async () => {
    const result = await updateBooking({
      id: "booking-1",
      version: 4,
      tripId: "trip-1",
      type: "activity",
      title: "Museum visit updated",
      reservationState: "booked",
      participantScope: "selected",
      travelerIds: ["asha", "ravi"]
    });

    const bookingTable = mocks.from.mock.results.find((result) => result.value?.update)?.value;
    expect(bookingTable.update).toHaveBeenCalledWith(expect.not.objectContaining({ participant_scope: expect.anything() }));
    expect(mocks.syncBookingParticipants).toHaveBeenCalledWith({ bookingId: "booking-1", participantScope: "selected", travelerIds: ["asha", "ravi"] });
    expect(mocks.cacheParticipantAssignments).toHaveBeenCalledWith({ tripId: "trip-1", bookingId: "booking-1", itineraryItemIds: ["event-1", "event-2"], participantScope: "selected", travelerIds: ["asha", "ravi"] });
    expect(result).toMatchObject({ participant_scope: "selected", version: 6 });
  });
});
