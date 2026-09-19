import { describe, expect, it } from "vitest";
import { bookingAppearance, bookingCountdown } from "./bookingPresentation";
import { bookingTypes, type Booking } from "./types";

describe("booking presentation", () => {
  const now = new Date("2026-09-19T10:00:00Z");
  it.each(bookingTypes)("gives %s a matching icon and schedule labels", (type) => {
    expect(bookingAppearance[type].icon).toBeDefined();
    expect(bookingAppearance[type].start).toBeTruthy();
    expect(bookingAppearance[type].end).toBeTruthy();
  });
  it.each([
    ["hotel", "check-in"],
    ["cab", "pickup"],
    ["ferry", "sailing"],
    ["bus", "departure"],
    ["train", "departure"],
    ["activity", "start"],
    ["restaurant", "reservation"]
  ] as const)("uses the relevant countdown for %s", (type, label) => {
    expect(bookingCountdown({ type } as Booking, "2026-09-19T12:00:00Z", now)).toBe(
      `2h to ${label}`
    );
  });
  it("does not invent times or claim that a booking was completed", () => {
    const booking = { type: "hotel" } as Booking;
    expect(bookingCountdown(booking, null, now)).toBeNull();
    expect(bookingCountdown(booking, "invalid", now)).toBeNull();
    expect(bookingCountdown(booking, "2026-09-19T08:00:00Z", now)).toBe("Check-in time passed");
  });
});
