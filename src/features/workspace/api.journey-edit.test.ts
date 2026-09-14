import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, BusJourneyDetails, JourneyLeg } from "./types";

const mocks = vi.hoisted(() => ({
  cacheEntity: vi.fn().mockResolvedValue(undefined),
  rpc: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
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

import { updateJourneyLeg } from "./api";

const savedLeg: JourneyLeg = {
  id: "11111111-1111-4111-8111-111111111111", booking_id: "22222222-2222-4222-8222-222222222222",
  segment_order: 0, mode: "bus", operator_name: "Qistna Express", service_number: "SGV8",
  origin_code: null, origin_name: "Bugis", origin_country_code: "SG", origin_timezone: "Asia/Singapore",
  destination_code: null, destination_name: "KL Sentral", destination_country_code: "MY", destination_timezone: "Asia/Kuala_Lumpur",
  scheduled_departure_at: "2026-09-30T01:00:00.000Z", scheduled_arrival_at: "2026-09-30T06:51:00.000Z",
  boarding_at: "2026-09-30T00:30:00.000Z", boarding_lead_minutes: 30, departure_platform: "Exit D",
  arrival_platform: null, coach_or_cabin: null, seat: null,
  details: { kind: "bus", bus_class_or_layout: "Executive (2+1)", shared_ticket_number: "SGV8G20684227" }, status_note: null, version: 4
};

const savedBooking: Booking = {
  id: savedLeg.booking_id, trip_id: "33333333-3333-4333-8333-333333333333", type: "bus", title: "Singapore to Kuala Lumpur",
  provider: "Qistna Express", reference_code: "I7UCJLFR", start_at: savedLeg.scheduled_departure_at,
  end_at: savedLeg.scheduled_arrival_at, source_timezone: savedLeg.origin_timezone, location: null, details: {},
  reservation_state: "booked", participant_scope: "everyone", journey_scope: "international",
  created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-14T00:00:00.000Z", version: 8
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.rpc.mockResolvedValue({ data: { leg: savedLeg, booking: savedBooking, itinerary_items: [{ id: "item-1", trip_id: savedBooking.trip_id, title: savedBooking.title }] }, error: null });
});

describe("updateJourneyLeg", () => {
  it("uses the atomic RPC and refreshes all three offline caches", async () => {
    const result = await updateJourneyLeg({
      tripId: savedBooking.trip_id,
      legId: savedLeg.id,
      version: 3,
      operatorName: " Qistna Express ",
      serviceNumber: "SGV8",
      originName: "Bugis",
      originCountryCode: "sg",
      originTimezone: "Asia/Singapore",
      destinationName: "KL Sentral",
      destinationCountryCode: "my",
      destinationTimezone: "Asia/Kuala_Lumpur",
      departureAt: savedLeg.scheduled_departure_at,
      arrivalAt: savedLeg.scheduled_arrival_at ?? undefined,
      boardingAt: savedLeg.boarding_at ?? undefined,
      boardingLeadMinutes: 30,
      departurePlatform: "Exit D",
      details: savedLeg.details as BusJourneyDetails
    });

    expect(mocks.rpc).toHaveBeenCalledWith("save_journey_leg", {
      requested_leg_id: savedLeg.id,
      requested_leg: expect.objectContaining({
        version: 3,
        operator_name: "Qistna Express",
        origin_country_code: "SG",
        destination_country_code: "MY",
        scheduled_arrival_at: savedLeg.scheduled_arrival_at,
        details: savedLeg.details
      })
    });
    expect(mocks.cacheEntity).toHaveBeenCalledWith(`journey-legs:${savedBooking.trip_id}`, savedLeg);
    expect(mocks.cacheEntity).toHaveBeenCalledWith(`bookings:${savedBooking.trip_id}`, savedBooking);
    expect(mocks.cacheEntity).toHaveBeenCalledWith(`itinerary:${savedBooking.trip_id}`, expect.objectContaining({ id: "item-1" }));
    expect(result).toEqual(expect.objectContaining({ leg: savedLeg, booking: savedBooking }));
  });

  it("does not allow a partial offline edit", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });

    await expect(updateJourneyLeg({
      tripId: savedBooking.trip_id,
      legId: savedLeg.id,
      originName: savedLeg.origin_name,
      originTimezone: savedLeg.origin_timezone,
      destinationName: savedLeg.destination_name,
      destinationTimezone: savedLeg.destination_timezone,
      departureAt: savedLeg.scheduled_departure_at,
      details: savedLeg.details as BusJourneyDetails
    })).rejects.toThrow(/saved together/i);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
