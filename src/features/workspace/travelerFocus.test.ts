import { describe, expect, it } from "vitest";
import { filterTravelerWorkspace } from "./travelerFocus";
import type { ItineraryItem, TripCost } from "../trips/types";
import type { Booking, Requirement, VaultDocument } from "./types";

const event = (id: string, all: boolean, bookingId?: string): ItineraryItem => ({ id, trip_id: "trip", booking_id: bookingId, title: id, starts_at: "2026-09-12T10:00:00Z", ends_at: null, timezone: "UTC", location: null, notes: null, applies_to_all_travelers: all, created_at: "" });
const booking = (id: string): Booking => ({ id, trip_id: "trip", type: "activity", title: id, provider: null, reference_code: null, start_at: null, end_at: null, source_timezone: null, location: null, details: {}, created_at: "", updated_at: "" });
const cost = (id: string, itineraryId?: string, bookingId?: string): TripCost => ({ id, trip_id: "trip", itinerary_item_id: itineraryId ?? null, booking_id: bookingId, title: id, category: "other", amount_minor: 100, currency_code: "INR", payment_status: "paid", notes: null, created_at: "" });
const requirement = (id: string): Requirement => ({ id, trip_id: "trip", type: "passport", title: id, destination_country_code: null, visa_type: null, status: "to_check", due_date: null, issued_on: null, expires_on: null, validity_buffer_days: null, official_guidance_url: null, guidance_checked_at: null, linked_document_id: null, notes: null });
const document = (id: string, mode: "shared" | "selected" | "unassigned", ids: string[]): VaultDocument => ({ id, trip_id: "trip", booking_id: null, flight_leg_id: null, traveler_id: null, assignment_mode: mode, traveler_ids: ids, title: id, category: "other", purpose: "other", short_label: null, visibility: "trip", current_version_id: null, updated_at: "" });

describe("traveler-focused trip workspace", () => {
  it("keeps shared and selected records while hiding another traveler's records", () => {
    const result = filterTravelerWorkspace({
      travelerId: "asha",
      itinerary: [event("shared", true, "shared-booking"), event("asha-event", false, "asha-booking"), event("ravi-event", false, "ravi-booking")],
      participants: [{ id: "a", itinerary_item_id: "asha-event", traveler_id: "asha" }, { id: "r", itinerary_item_id: "ravi-event", traveler_id: "ravi" }],
      bookings: [booking("shared-booking"), booking("asha-booking"), booking("ravi-booking")],
      bookingTravelers: [{ id: "a", booking_id: "asha-booking", traveler_id: "asha" }, { id: "r", booking_id: "ravi-booking", traveler_id: "ravi" }],
      costs: [cost("shared-cost", "shared", "shared-booking"), { ...cost("asha-cost", "asha-event"), participants: [{ traveler_id: "asha", share_amount_minor: null }] }, { ...cost("ravi-on-shared", "shared", "shared-booking"), participants: [{ traveler_id: "ravi", share_amount_minor: null }] }, cost("ravi-cost", "ravi-event"), cost("unlinked")],
      requirements: [requirement("asha-ready"), requirement("ravi-ready")],
      requirementAssignees: [{ id: "a", requirement_id: "asha-ready", traveler_id: "asha" }, { id: "r", requirement_id: "ravi-ready", traveler_id: "ravi" }],
      documents: [document("shared-doc", "shared", []), document("asha-doc", "selected", ["asha"]), document("ravi-doc", "selected", ["ravi"]), document("unassigned-doc", "unassigned", [])]
    });
    expect(result.itinerary.map((item) => item.id)).toEqual(["shared", "asha-event"]);
    expect(result.bookings.map((item) => item.id)).toEqual(["shared-booking", "asha-booking"]);
    expect(result.costs.map((item) => item.id)).toEqual(["shared-cost", "asha-cost"]);
    expect(result.requirements.map((item) => item.id)).toEqual(["asha-ready"]);
    expect(result.documents.map((item) => item.id)).toEqual(["shared-doc", "asha-doc"]);
  });
});
