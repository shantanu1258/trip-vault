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
  it("defaults hotel checkout to 11:00 on the following calendar day", () => expect(defaultHotelCheckoutLocal("2026-09-26T15:00")).toBe("2026-09-27T11:00"));
  it("accepts a later hotel checkout and rejects an actual earlier instant", () => {
    expect(hotelStayInstants({ checkInLocal: "2026-09-26T15:00", checkoutLocal: "2026-10-12T11:00", timeZone: "Asia/Kolkata" })).toEqual({
      checkInAt: "2026-09-26T09:30:00.000Z",
      checkoutAt: "2026-10-12T05:30:00.000Z"
    });
    expect(() => hotelStayInstants({ checkInLocal: "2026-09-27T15:00", checkoutLocal: "2026-09-26T11:00", timeZone: "Asia/Kolkata" })).toThrow(/must be after check-in/);
  });
});
