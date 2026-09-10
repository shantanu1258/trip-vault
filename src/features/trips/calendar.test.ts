import { describe, expect, it, vi } from "vitest";
import { buildTripCalendar } from "./calendar";
import type { ItineraryItem, Trip } from "./types";

const trip: Trip = { id: "trip", title: "Rome & Venice", destination_summary: "Italy", start_date: "2026-09-10", end_date: "2026-09-12", primary_timezone: "Europe/Rome", base_currency: "EUR", status: "upcoming", created_at: "", updated_at: "" };
const item: ItineraryItem = { id: "event", trip_id: "trip", title: "Train, platform 2", starts_at: "2026-09-10T08:00:00Z", ends_at: "2026-09-10T09:00:00Z", timezone: "Europe/Rome", location: { label: "Roma; Termini" }, notes: "Bring tickets", booking_id: null, applies_to_all_travelers: true, created_at: "" };

describe("calendar export", () => {
  it("builds a valid escaped iCalendar event", () => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-01-01T00:00:00Z")); const calendar = buildTripCalendar(trip, [item]); expect(calendar).toContain("BEGIN:VCALENDAR"); expect(calendar).toContain("SUMMARY:Train\\, platform 2"); expect(calendar).toContain("LOCATION:Roma\\; Termini"); expect(calendar).toContain("END:VCALENDAR"); vi.useRealTimers(); });
});
