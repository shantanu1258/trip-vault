import { describe, expect, it } from "vitest";
import type { Trip } from "./types";
import {
  currentItineraryItem,
  formatDateRange,
  groupCostTotals,
  itineraryDateKey,
  moveEqualTimeItem,
  selectFocusedTrip,
  tripPhase,
  isTripInLaunchWindow
} from "./presentation";

const trip = (id: string, start: string, end: string, timezone = "Europe/Rome"): Trip => ({
  id,
  title: id,
  destination_summary: "Somewhere",
  start_date: start,
  end_date: end,
  primary_timezone: timezone,
  base_currency: "EUR",
  status: "upcoming",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
});

describe("trip focus", () => {
  it("formats compact weekday ranges without repeating the year", () => {
    expect(formatDateRange("2026-09-26", "2026-10-12", { includeWeekday: true })).toBe(
      "Sat, 26 Sep – Mon, 12 Oct 2026"
    );
    expect(formatDateRange("2026-09-26", "2026-09-26", { includeWeekday: true })).toBe(
      "Sat, 26 Sep 2026"
    );
    expect(formatDateRange("2026-12-31", "2027-01-02", { includeWeekday: true })).toBe(
      "Thu, 31 Dec 2026 – Sat, 2 Jan 2027"
    );
    expect(formatDateRange("2026-09-26", "2026-10-12")).toBe("Sep 26, 2026 - Oct 12, 2026");
  });
  it("uses ten calendar days in the trip timezone, including the last travel day", () => {
    const holiday = trip("launch", "2026-03-30", "2026-04-02");
    expect(isTripInLaunchWindow(holiday, new Date("2026-03-19T22:59:00Z"))).toBe(false);
    expect(isTripInLaunchWindow(holiday, new Date("2026-03-19T23:00:00Z"))).toBe(true);
    expect(isTripInLaunchWindow(holiday, new Date("2026-04-02T21:59:00Z"))).toBe(true);
    expect(isTripInLaunchWindow(holiday, new Date("2026-04-02T22:00:00Z"))).toBe(false);
  });
  it("starts current mode on the prior calendar day in the trip timezone", () =>
    expect(tripPhase(trip("a", "2026-03-30", "2026-04-02"), new Date("2026-03-29T22:30:00Z"))).toBe(
      "current"
    ));
  it("handles the D-1 boundary across the daylight-saving change", () =>
    expect(tripPhase(trip("a", "2026-03-30", "2026-04-02"), new Date("2026-03-28T22:30:00Z"))).toBe(
      "upcoming"
    ));
  it("honors a saved eligible overlap", () => {
    const trips = [trip("a", "2026-09-10", "2026-09-13"), trip("b", "2026-09-10", "2026-09-12")];
    expect(selectFocusedTrip(trips, "a", new Date("2026-09-10T10:00:00Z"))?.id).toBe("a");
  });
  it("breaks unsaved overlap ties by earliest end then stable id", () => {
    const trips = [trip("z", "2026-09-10", "2026-09-12"), trip("a", "2026-09-10", "2026-09-12")];
    expect(selectFocusedTrip(trips, null, new Date("2026-09-10T10:00:00Z"))?.id).toBe("a");
  });
  it("does not count refunds in trip totals", () =>
    expect(
      groupCostTotals([
        {
          id: "1",
          trip_id: "a",
          itinerary_item_id: null,
          title: "Hotel",
          category: "hotel",
          amount_minor: 1000,
          currency_code: "EUR",
          payment_status: "paid",
          notes: null,
          created_at: ""
        },
        {
          id: "2",
          trip_id: "a",
          itinerary_item_id: null,
          title: "Refund",
          category: "hotel",
          amount_minor: 300,
          currency_code: "EUR",
          payment_status: "refunded",
          notes: null,
          created_at: ""
        }
      ])
    ).toEqual({ EUR: 1000 }));
  it("selects a time-current itinerary item before the next item", () => {
    const base = {
      trip_id: "a",
      booking_id: null,
      timezone: "UTC",
      location: null,
      notes: null,
      applies_to_all_travelers: true,
      created_at: ""
    };
    const items = [
      {
        ...base,
        id: "now",
        title: "Now",
        starts_at: "2026-09-10T10:00:00Z",
        ends_at: "2026-09-10T11:00:00Z"
      },
      { ...base, id: "next", title: "Next", starts_at: "2026-09-10T12:00:00Z", ends_at: null }
    ];
    expect(currentItineraryItem(items, new Date("2026-09-10T10:30:00Z"))?.id).toBe("now");
  });
  it("reorders only itinerary items with the same start time", () => {
    const base = {
      trip_id: "a",
      booking_id: null,
      timezone: "UTC",
      location: null,
      notes: null,
      applies_to_all_travelers: true,
      created_at: "",
      ends_at: null
    };
    const items = [
      { ...base, id: "a", title: "A", starts_at: "2026-09-10T10:00:00Z" },
      { ...base, id: "b", title: "B", starts_at: "2026-09-10T10:00:00Z" },
      { ...base, id: "c", title: "C", starts_at: "2026-09-10T11:00:00Z" }
    ];
    expect(moveEqualTimeItem(items, "b", "up").map((item) => item.id)).toEqual(["b", "a", "c"]);
    expect(moveEqualTimeItem(items, "b", "down")).toBe(items);
  });
  it("groups an instant by the itinerary timezone date", () =>
    expect(itineraryDateKey("2026-09-10T20:30:00Z", "Asia/Kolkata")).toBe("2026-09-11"));
});
