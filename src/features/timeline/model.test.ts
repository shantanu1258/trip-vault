import { describe, expect, it } from "vitest";
import { arrivalDayOffset, journeyDuration, journeyEndDetails, normalizePhoneNumber, phoneActionUrls, readinessSummary, resolveCurrentTimelineItem, searchTrip, timelinePhase, validateLegOrder } from "./model";
import type { ItineraryItem } from "../trips/types";

const event = (id: string, start: string, end: string | null = null): ItineraryItem => ({ id, trip_id: "trip", booking_id: null, title: id, event_type: "activity", starts_at: start, ends_at: end, timezone: "UTC", location: null, notes: null, applies_to_all_travelers: true, created_at: "" });

describe("timeline model", () => {
  it("selects a spanning journey before the next event", () => expect(resolveCurrentTimelineItem([{ ...event("now", "2026-09-11T10:00:00Z", "2026-09-11T11:00:00Z"), event_type: "flight" }, event("next", "2026-09-11T12:00:00Z")], new Date("2026-09-11T10:30:00Z"))?.id).toBe("now"));
  it("ignores completed preparation events", () => expect(resolveCurrentTimelineItem([{ ...event("done", "2026-09-11T11:00:00Z"), event_type: "preparation", completed_at: "2026-09-10T00:00:00Z" }, event("next", "2026-09-11T12:00:00Z")], new Date("2026-09-11T10:30:00Z"))?.id).toBe("next"));
  it("keeps an all-day event current for its complete local calendar day", () => expect(resolveCurrentTimelineItem([{ ...event("all-day", "2026-09-11T12:00:00Z"), is_all_day: true, timezone: "Asia/Kolkata" }, event("tomorrow", "2026-09-12T04:00:00Z")], new Date("2026-09-11T16:00:00Z"))?.id).toBe("all-day"));
  it("falls back to the latest event when a completed trip has no next event", () => expect(resolveCurrentTimelineItem([event("first", "2026-09-09T10:00:00Z"), event("last", "2026-09-10T10:00:00Z")], new Date("2026-09-11T10:00:00Z"))?.id).toBe("last"));
  it("labels every event as past, current, or future without removing it from the timeline", () => {
    const now = new Date("2026-09-11T10:30:00Z");
    expect(timelinePhase(event("past", "2026-09-11T08:00:00Z", "2026-09-11T09:00:00Z"), now)).toBe("past");
    expect(timelinePhase({ ...event("current", "2026-09-11T10:00:00Z", "2026-09-11T11:00:00Z"), event_type: "train" }, now)).toBe("current");
    expect(timelinePhase(event("future", "2026-09-11T12:00:00Z"), now)).toBe("future");
  });
  it("uses end times only for journey events", () => {
    const ordinary = event("museum", "2026-09-11T10:00:00Z", "2026-09-11T12:00:00Z");
    const flight = { ...ordinary, id: "flight", event_type: "flight" as const };
    expect(timelinePhase(ordinary, new Date("2026-09-11T11:00:00Z"))).toBe("past");
    expect(journeyEndDetails(ordinary)).toBeNull();
    expect(timelinePhase(flight, new Date("2026-09-11T11:00:00Z"))).toBe("current");
    expect(journeyEndDetails(flight)).toEqual({ endsAt: "2026-09-11T12:00:00Z", duration: "2h" });
  });
  it("calculates elapsed time from instants rather than wall-clock labels", () => expect(journeyDuration("2026-09-11T03:30:00Z", "2026-09-11T12:15:00Z")).toBe("8h 45m"));
  it("shows ticket-style next-day arrival", () => expect(arrivalDayOffset("2026-09-11T18:00:00Z", "Asia/Dubai", "2026-09-12T06:00:00Z", "Europe/London")).toBe(1));
  it("rejects overlapping connections", () => expect(validateLegOrder([{ departureAt: "2026-09-11T10:00:00Z", arrivalAt: "2026-09-11T12:00:00Z" }, { departureAt: "2026-09-11T11:00:00Z", arrivalAt: "2026-09-11T14:00:00Z" }])).toContain("Leg 2"));
  it("builds call and WhatsApp actions from an international number", () => expect(phoneActionUrls("+91 98765-43210")).toEqual({ call: "tel:+919876543210", whatsapp: "https://wa.me/919876543210" }));
  it("rejects unusable numbers", () => expect(normalizePhoneNumber("123")).toBeNull());
  it("derives the readiness card from unresolved requirements", () => expect(readinessSummary([{ status: "complete", due_date: null }, { status: "required", due_date: "2026-09-20" }] as never)).toEqual({ total: 2, resolved: 1, remaining: 1, dueDate: "2026-09-20" }));
  it("finds a flight by number without reading document contents", () => expect(searchTrip({ query: "sq403", tripId: "trip", itinerary: [], bookings: [{ id: "booking", trip_id: "trip", type: "flight", title: "To Singapore", provider: "Singapore Airlines", reference_code: "ABC", start_at: null, end_at: null, source_timezone: null, location: null, details: {}, created_at: "" }], flights: [{ booking_id: "booking", flight_number: "SQ403", airline_name: "Singapore Airlines" } as never], journeys: [], documents: [], travelers: [], requirements: [] })[0]?.title).toBe("To Singapore"));
});
