import { describe, expect, it } from "vitest";
import { amountStringToMinor, defaultHotelCheckoutLocal, hotelStayInstants, localDateTimeCandidates, localDateTimeToIso, tripFormSchema } from "./validation";

describe("trip validation", () => {
  const valid = { title: "Japan", destination: "Tokyo", startDate: "2026-10-10", endDate: "2026-10-18", timezone: "Asia/Tokyo", baseCurrency: "jpy" };
  it("normalizes currency and accepts a chronological trip", () => expect(tripFormSchema.parse(valid).baseCurrency).toBe("JPY"));
  it("rejects an end before the start", () => expect(tripFormSchema.safeParse({ ...valid, endDate: "2026-10-09" }).success).toBe(false));
  it("rejects an unknown IANA timezone", () => expect(tripFormSchema.safeParse({ ...valid, timezone: "Mars/Olympus" }).success).toBe(false));
  it("converts a local provider time to the correct instant", () => expect(localDateTimeToIso("2026-07-01T09:30", "Asia/Kolkata")).toBe("2026-07-01T04:00:00.000Z"));
  it("rejects a daylight-saving gap instead of silently changing the ticket time", () => expect(() => localDateTimeToIso("2026-03-29T02:30", "Europe/Rome")).toThrow(/does not exist/));
  it("requires a choice when a local clock time occurs twice", () => { expect(localDateTimeCandidates("2026-10-25T02:30", "Europe/Rome")).toHaveLength(2); expect(() => localDateTimeToIso("2026-10-25T02:30", "Europe/Rome")).toThrow(/occurs twice/); expect(localDateTimeToIso("2026-10-25T02:30", "Europe/Rome", "later")).toBe("2026-10-25T01:30:00.000Z"); });
  it("uses currency-specific minor units", () => { expect(amountStringToMinor("12.34", "USD")).toBe(1234); expect(amountStringToMinor("125", "JPY")).toBe(125); });
  it.each([
    ["an ordinary day", "2026-09-26T15:00", "2026-09-27T11:00"],
    ["the end of a month", "2026-01-31T23:00", "2026-02-01T11:00"],
    ["the end of a year", "2026-12-31T15:00", "2027-01-01T11:00"],
    ["a leap day", "2028-02-28T15:00", "2028-02-29T11:00"]
  ])("defaults hotel checkout across %s", (_case, checkIn, expected) => expect(defaultHotelCheckoutLocal(checkIn)).toBe(expected));
  it("does not manufacture a checkout from an incomplete check-in", () => expect(defaultHotelCheckoutLocal("")).toBe(""));
  it("reports which required hotel time is missing", () => {
    expect(() => hotelStayInstants({ checkInLocal: "", checkoutLocal: "2026-09-27T11:00", timeZone: "Asia/Kolkata" })).toThrow(/check-in date and time/);
    expect(() => hotelStayInstants({ checkInLocal: "2026-09-26T15:00", checkoutLocal: "", timeZone: "Asia/Kolkata" })).toThrow(/checkout date and time/);
  });
  it("accepts a later hotel checkout after converting the hotel-local clocks", () => {
    expect(hotelStayInstants({ checkInLocal: "2026-09-26T15:00", checkoutLocal: "2026-10-12T11:00", timeZone: "Asia/Kolkata" })).toEqual({
      checkInAt: "2026-09-26T09:30:00.000Z",
      checkoutAt: "2026-10-12T05:30:00.000Z"
    });
  });
  it.each([
    ["the same instant", "2026-09-27T15:00"],
    ["an earlier instant", "2026-09-27T14:59"]
  ])("rejects hotel checkout at %s", (_case, checkoutLocal) => expect(() => hotelStayInstants({ checkInLocal: "2026-09-27T15:00", checkoutLocal, timeZone: "Asia/Kolkata" })).toThrow(/must be after check-in/));
  it("honors the selected occurrences when daylight saving repeats a hotel-local time", () => {
    expect(hotelStayInstants({
      checkInLocal: "2026-10-25T02:30",
      checkoutLocal: "2026-10-25T02:30",
      timeZone: "Europe/Rome",
      checkInOccurrence: "earlier",
      checkoutOccurrence: "later"
    })).toEqual({ checkInAt: "2026-10-25T00:30:00.000Z", checkoutAt: "2026-10-25T01:30:00.000Z" });
  });
});
