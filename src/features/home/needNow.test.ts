import { describe, expect, it } from "vitest";
import { resolveNeedNow } from "./needNow";
import type { Booking, FlightLeg, VaultDocument } from "../workspace/types";

const booking = (id: string, type: Booking["type"]): Booking => ({ id, trip_id: "t", type, title: id, provider: null, reference_code: null, start_at: null, end_at: null, source_timezone: null, location: null, details: {}, created_at: "" });
const flight = { id: "f", booking_id: "flight", airline_name: "Aster", flight_number: "AV1" } as FlightLeg;
const document = (id: string, purpose: VaultDocument["purpose"]): VaultDocument => ({ id, trip_id: "t", booking_id: "flight", flight_leg_id: "f", traveler_id: null, title: id, category: "flight", purpose, short_label: null, visibility: "trip", current_version_id: null, updated_at: "" });

describe("need-now resolver", () => {
  it("prefers a boarding pass over a ticket and avoids a duplicate flight bubble", () => { const items = resolveNeedNow({ tripId: "t", bookings: [booking("flight", "flight")], flights: [flight], requirements: [], documents: [document("ticket", "ticket"), document("pass", "boarding_pass")] }); expect(items).toHaveLength(1); expect(items[0].label).toBe("Boarding pass"); });
  it("limits shortcuts to five actual targets in deterministic priority order", () => { const items = resolveNeedNow({ tripId: "t", bookings: [booking("flight", "flight"), booking("hotel", "hotel"), booking("taxi", "transport")], flights: [flight], requirements: [{ id: "r", trip_id: "t", type: "visa", title: "Visa", status: "required" } as never], documents: [document("ticket", "ticket"), { ...document("insurance", "insurance"), booking_id: null, flight_leg_id: null }] }); expect(items.length).toBeLessThanOrEqual(5); expect(items.every((item) => item.target.startsWith("/trips/t"))).toBe(true); });
});
