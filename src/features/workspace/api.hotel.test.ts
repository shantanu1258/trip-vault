import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "./types";

const mocks = vi.hoisted(() => ({
  addTripCost: vi.fn(),
  cacheEntity: vi.fn(),
  cacheParticipantAssignments: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
vi.mock("../sync/localSync", () => ({
  cacheEntity: mocks.cacheEntity,
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
vi.mock("../trips/api", () => ({ addItineraryItem: vi.fn(), addTripCost: mocks.addTripCost }));
vi.mock("../trips/participantSync", () => ({
  cacheParticipantAssignments: mocks.cacheParticipantAssignments,
  queueBookingParticipantSync: vi.fn(),
  syncBookingParticipants: vi.fn()
}));
vi.mock("../metadata/publishedConfig", () => ({ listAvailableAirlines: vi.fn() }));

import { addBookedTimelineEvent, saveHotelStay } from "./api";
import { COST_SAVE_WARNING } from "./creationCompletion";

const savedBooking: Booking = {
  id: "booking-hotel",
  trip_id: "trip-1",
  type: "hotel",
  title: "Harbour Hotel",
  provider: "Harbour Hotel",
  reference_code: "HOTEL1",
  start_at: "2026-09-27T06:30:00.000Z",
  end_at: "2026-09-29T04:30:00.000Z",
  source_timezone: "Asia/Kolkata",
  location: { label: "1 Bay Road", address: "1 Bay Road", map_url: "https://maps.app.goo.gl/hotel" },
  details: { room_type: "Family suite", notes: "Late arrival" },
  reservation_state: "booked",
  participant_scope: "selected",
  journey_scope: null,
  created_at: "2026-09-01T00:00:00.000Z"
};

describe("atomic hotel stay persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.rpc.mockResolvedValue({ data: { booking_id: "booking-hotel", check_in_id: "check-in-1", check_out_id: "check-out-1" }, error: null });
    mocks.addTripCost.mockResolvedValue(undefined);
    mocks.from.mockImplementation((table: string) => {
      if (table === "bookings") return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: savedBooking, error: null }) })) }))
      };
      if (table === "itinerary_items") return {
        select: vi.fn(() => ({ in: vi.fn(() => ({ order: vi.fn().mockResolvedValue({ data: [
          { id: "check-in-1", booking_id: "booking-hotel", event_type: "hotel_check_in", starts_at: savedBooking.start_at },
          { id: "check-out-1", booking_id: "booking-hotel", event_type: "hotel_check_out", starts_at: savedBooking.end_at }
        ], error: null }) })) }))
      };
      throw new Error(`Unexpected table: ${table}`);
    });
  });

  it("updates booking, participants, and both time-semantics through one RPC", async () => {
    const result = await saveHotelStay({
      bookingId: "booking-hotel",
      version: 4,
      tripId: "trip-1",
      type: "hotel",
      eventType: "hotel_check_in",
      title: "Harbour Hotel",
      provider: "Harbour Hotel",
      referenceCode: "HOTEL1",
      startsAt: "2026-09-27T06:30:00.000Z",
      endsAt: "2026-09-29T04:30:00.000Z",
      timezone: "Asia/Kolkata",
      location: "1 Bay Road",
      mapUrl: "https://maps.app.goo.gl/hotel",
      notes: "Late arrival",
      bookingDetails: { room_type: "Family suite" },
      reservationState: "booked",
      participantScope: "selected",
      travelerIds: ["traveler-1"],
      hotelCheckInHasTime: false,
      hotelCheckoutHasTime: true
    });

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("save_hotel_stay", {
      requested_booking: expect.objectContaining({
        id: "booking-hotel",
        trip_id: "trip-1",
        type: "hotel",
        start_at: "2026-09-27T06:30:00.000Z",
        end_at: "2026-09-29T04:30:00.000Z",
        participant_scope: "selected",
        details: { room_type: "Family suite", notes: "Late arrival" },
        location: { label: "1 Bay Road", address: "1 Bay Road", map_url: "https://maps.app.goo.gl/hotel" },
        version: 4
      }),
      requested_traveler_ids: ["traveler-1"],
      requested_milestones: expect.objectContaining({ check_in_has_time: false, check_out_has_time: true })
    });
    expect(result).toEqual(expect.objectContaining({ booking: savedBooking }));
    expect(mocks.from).toHaveBeenCalledWith("bookings");
    expect(mocks.from).toHaveBeenCalledWith("itinerary_items");
    expect(mocks.cacheParticipantAssignments).toHaveBeenCalledWith({
      tripId: "trip-1",
      bookingId: "booking-hotel",
      itineraryItemIds: ["check-in-1", "check-out-1"],
      participantScope: "selected",
      travelerIds: ["traveler-1"]
    });
  });

  it("rejects unsafe hotel edits before making a network write", async () => {
    await expect(saveHotelStay({
      bookingId: "booking-hotel",
      tripId: "trip-1",
      type: "hotel",
      eventType: "hotel_check_in",
      title: "Harbour Hotel",
      startsAt: "2026-09-29T04:30:00.000Z",
      endsAt: "2026-09-27T06:30:00.000Z",
      timezone: "Asia/Kolkata"
    })).rejects.toThrow("Hotel checkout must be after check-in");

    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("keeps an atomically saved hotel and reports an optional cost failure as a warning", async () => {
    mocks.addTripCost.mockRejectedValue(new Error("trip cost policy rejected the row"));

    const result = await addBookedTimelineEvent({
      tripId: "trip-1",
      type: "hotel",
      eventType: "hotel_check_in",
      title: "Harbour Hotel",
      provider: "Harbour Hotel",
      startsAt: savedBooking.start_at!,
      endsAt: savedBooking.end_at!,
      timezone: savedBooking.source_timezone!,
      cost: { title: "Harbour Hotel", amountMinor: 45_000_00, currencyCode: "INR", paymentStatus: "paid" }
    });

    expect(result.booking.id).toBe(savedBooking.id);
    expect(result.itinerary).toHaveLength(2);
    expect(result.costWarning).toBe(COST_SAVE_WARNING);
    expect(mocks.addTripCost).toHaveBeenCalledWith(expect.objectContaining({ bookingId: savedBooking.id, category: "hotel" }));
  });
});
