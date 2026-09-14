import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem } from "./types";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  readEntityList: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({
  supabase: { from: mocks.from }
}));

vi.mock("../sync/localSync", () => ({
  cacheEntity: vi.fn(),
  localProfileId: vi.fn(),
  networkWithCache: vi.fn(),
  queueCreate: vi.fn(),
  queueDelete: vi.fn(),
  queueUpdate: vi.fn(),
  readEntityList: mocks.readEntityList
}));

vi.mock("./participantSync", () => ({
  cacheParticipantAssignments: vi.fn(),
  queueBookingParticipantSync: vi.fn(),
  syncBookingParticipants: vi.fn()
}));

import { updateItineraryItem } from "./api";

describe("hotel timeline edit safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it.each(["hotel_check_in", "hotel_check_out"] as const)("rejects a generic edit of a linked %s milestone before any network write", async (eventType) => {
    const existing: ItineraryItem = {
      id: `hotel-${eventType}`,
      trip_id: "trip-1",
      booking_id: "hotel-booking-1",
      title: eventType === "hotel_check_in" ? "Check in · Palm Springs" : "Check out · Palm Springs",
      event_type: eventType,
      starts_at: eventType === "hotel_check_in" ? "2026-09-28T08:00:00.000Z" : "2026-09-30T04:00:00.000Z",
      ends_at: null,
      timezone: "Asia/Dubai",
      location: { label: "Palm Jumeirah" },
      notes: null,
      applies_to_all_travelers: true,
      timing_mode: "exact",
      event_status: "planned",
      version: 1,
      created_at: "2026-09-01T00:00:00.000Z"
    };
    mocks.readEntityList.mockResolvedValue([existing]);

    await expect(updateItineraryItem({
      id: existing.id,
      tripId: existing.trip_id,
      bookingId: existing.booking_id ?? undefined,
      eventType,
      title: existing.title,
      startsAt: existing.starts_at,
      timezone: existing.timezone,
      participantScope: "everyone",
      travelerIds: [],
      version: existing.version
    })).rejects.toThrow("Edit the hotel booking to change its check-in or checkout milestone.");

    expect(mocks.from).not.toHaveBeenCalled();
  });
});
