import { describe, expect, it, vi } from "vitest";
import { buildTripCalendar } from "./calendar";
import type { ItineraryItem, Trip } from "./types";

const trip: Trip = {
  id: "trip",
  title: "Rome & Venice",
  destination_summary: "Italy",
  start_date: "2026-09-10",
  end_date: "2026-09-12",
  primary_timezone: "Europe/Rome",
  base_currency: "EUR",
  status: "upcoming",
  created_at: "",
  updated_at: ""
};
const item: ItineraryItem = {
  id: "event",
  trip_id: "trip",
  title: "Train, platform 2",
  starts_at: "2026-09-10T08:00:00Z",
  ends_at: "2026-09-10T09:00:00Z",
  timezone: "Europe/Rome",
  location: { label: "Roma; Termini" },
  notes: "Bring tickets",
  booking_id: null,
  applies_to_all_travelers: true,
  created_at: ""
};

describe("calendar export", () => {
  it("builds a valid escaped iCalendar event", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const calendar = buildTripCalendar(trip, [item]);
    expect(calendar).toContain("BEGIN:VCALENDAR");
    expect(calendar).toContain("SUMMARY:Train\\, platform 2");
    expect(calendar).toContain("LOCATION:Roma\\; Termini");
    expect(calendar).toContain("END:VCALENDAR");
    vi.useRealTimers();
  });
  it("does not export a fabricated clock time for relation-only or unscheduled events", () => {
    const relative = {
      ...item,
      id: "relative",
      timing_mode: "relative" as const,
      anchor_itinerary_item_id: item.id,
      relative_position: "after" as const,
      has_explicit_start_time: false
    };
    const unscheduled = { ...item, id: "unscheduled", timing_mode: "unscheduled" as const };
    const calendar = buildTripCalendar(trip, [relative, unscheduled]);
    expect(calendar).not.toContain("BEGIN:VEVENT");
  });
});
