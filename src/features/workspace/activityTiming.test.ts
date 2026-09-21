import { describe, expect, it } from "vitest";
import { activityBookingTiming, activityEventTiming, applyActivityTiming } from "./activityTiming";
import type { ItineraryItem } from "../trips/types";
import type { Booking } from "./types";

const item = {
  event_type: "activity",
  timezone: "Asia/Singapore",
  starts_at: "2026-09-26T02:00:00Z",
  ends_at: null,
  timing_mode: "exact",
  has_explicit_start_time: true,
  version: 3
} as ItineraryItem;
describe("activity booking timing mirrors", () => {
  it("inherits the event zone without inventing a booking time for an untimed plan", () => {
    expect(
      activityBookingTiming({ ...item, timing_mode: "date_only", has_explicit_start_time: false })
    ).toEqual({
      source_timezone: "Asia/Singapore",
      start_at: null,
      end_at: null
    });
  });
  it("keeps offline event timing and versions aligned with a booking edit", () => {
    const booking = {
      type: "activity",
      source_timezone: "Asia/Dubai",
      start_at: "2026-09-26T06:00:00Z",
      end_at: "2026-09-26T07:00:00Z"
    } as Booking;
    const updated = applyActivityTiming(item, activityEventTiming(item, booking));
    expect(updated).toMatchObject({
      timezone: "Asia/Dubai",
      starts_at: booking.start_at,
      ends_at: booking.end_at,
      scheduled_date: "2026-09-26",
      duration_minutes: 60,
      version: 4
    });
    expect(applyActivityTiming(updated, activityEventTiming(updated, booking))).toBe(updated);
  });
  it("does not change untimed event mode or bump versions for equivalent timestamps", () => {
    const untimed = { ...item, timing_mode: "relative" as const, has_explicit_start_time: false };
    expect(
      activityEventTiming(untimed, {
        type: "activity",
        source_timezone: "Asia/Dubai",
        start_at: null
      } as Booking)
    ).toEqual({ timezone: "Asia/Dubai" });
    expect(applyActivityTiming(item, { starts_at: "2026-09-26T02:00:00.000+00:00" })).toBe(item);
  });
});
