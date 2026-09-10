import { describe, expect, it } from "vitest";
import { amountStringToMinor, localDateTimeToIso, tripFormSchema } from "./validation";

describe("trip validation", () => {
  const valid = { title: "Japan", destination: "Tokyo", startDate: "2026-10-10", endDate: "2026-10-18", timezone: "Asia/Tokyo", baseCurrency: "jpy" };
  it("normalizes currency and accepts a chronological trip", () => expect(tripFormSchema.parse(valid).baseCurrency).toBe("JPY"));
  it("rejects an end before the start", () => expect(tripFormSchema.safeParse({ ...valid, endDate: "2026-10-09" }).success).toBe(false));
  it("rejects an unknown IANA timezone", () => expect(tripFormSchema.safeParse({ ...valid, timezone: "Mars/Olympus" }).success).toBe(false));
  it("converts a local provider time to the correct instant", () => expect(localDateTimeToIso("2026-07-01T09:30", "Asia/Kolkata")).toBe("2026-07-01T04:00:00.000Z"));
  it("uses currency-specific minor units", () => { expect(amountStringToMinor("12.34", "USD")).toBe(1234); expect(amountStringToMinor("125", "JPY")).toBe(125); });
});
