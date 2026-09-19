import { describe, expect, it } from "vitest";
import { bookingAppearance, bookingCountdown } from "./bookingPresentation";
import { bookingTypes, type Booking, type BookingType } from "./types";

const scheduleLabels: Record<BookingType, { start: string; end: string; countdown: string }> = {
  flight: { start: "Departure", end: "Arrival", countdown: "departure" },
  hotel: { start: "Check-in", end: "Check-out", countdown: "check-in" },
  cab: { start: "Pickup", end: "Drop-off", countdown: "pickup" },
  ferry: { start: "Departure", end: "Arrival", countdown: "sailing" },
  bus: { start: "Departure", end: "Arrival", countdown: "departure" },
  train: { start: "Departure", end: "Arrival", countdown: "departure" },
  transport: { start: "Starts", end: "Ends", countdown: "departure" },
  activity: { start: "Entry", end: "Ends", countdown: "start" },
  restaurant: { start: "Reservation", end: "Ends", countdown: "reservation" },
  other: { start: "Starts", end: "Ends", countdown: "start" }
};

describe("booking presentation", () => {
  const now = new Date("2026-09-19T10:00:00Z");
  it.each(bookingTypes)(
    "provides %s artwork, schedule labels, and the relevant countdown",
    (type) => {
      expect(bookingAppearance[type].icon).toBeDefined();
      expect(bookingAppearance[type]).toMatchObject(scheduleLabels[type]);
      expect(bookingCountdown({ type } as Booking, "2026-09-19T12:00:00Z", now)).toBe(
        `2h to ${scheduleLabels[type].countdown}`
      );
    }
  );
  it("does not invent times or claim that a booking was completed", () => {
    const booking = { type: "hotel" } as Booking;
    expect(bookingCountdown(booking, null, now)).toBeNull();
    expect(bookingCountdown(booking, "invalid", now)).toBeNull();
    expect(bookingCountdown(booking, "2026-09-19T08:00:00Z", now)).toBe("Check-in time passed");
  });
});
