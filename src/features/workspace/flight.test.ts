import { describe, expect, it } from "vitest";
import {
  delayMinutes,
  effectiveDeparture,
  flightCountdown,
  flightSeatLabels,
  primaryFlightDocument,
  resolveBoardingInstant,
  trackerUrl
} from "./flight";
import type { FlightLeg, FlightTraveler, Traveler, VaultDocument } from "./types";

const flight: FlightLeg = {
  id: "f",
  booking_id: "b",
  segment_order: 0,
  airline_name: "Aster Air",
  flight_number: "AV 218",
  departure_airport_code: "DEL",
  departure_airport_name: "Delhi",
  arrival_airport_code: "FCO",
  arrival_airport_name: "Rome",
  scheduled_departure_at: "2026-09-10T10:00:00Z",
  scheduled_arrival_at: "2026-09-10T18:00:00Z",
  estimated_departure_at: null,
  estimated_arrival_at: null,
  actual_departure_at: null,
  actual_arrival_at: null,
  departure_timezone: "Asia/Kolkata",
  arrival_timezone: "Europe/Rome",
  boarding_at: null,
  departure_terminal: null,
  departure_gate: null,
  arrival_terminal: null,
  arrival_gate: null,
  baggage_claim: null,
  status: "scheduled",
  status_note: null,
  status_updated_by: "u",
  status_updated_at: "2026-09-10T00:00:00Z"
};
const document = (id: string, purpose: VaultDocument["purpose"]): VaultDocument => ({
  id,
  trip_id: "t",
  booking_id: "b",
  flight_leg_id: "f",
  traveler_id: null,
  title: id,
  category: "flight",
  purpose,
  short_label: null,
  visibility: "trip",
  current_version_id: null,
  updated_at: ""
});

describe("flight presentation", () => {
  it("shows a ticket until a boarding pass exists", () =>
    expect(primaryFlightDocument([document("ticket", "ticket")])?.id).toBe("ticket"));
  it("promotes the boarding pass over the ticket", () =>
    expect(
      primaryFlightDocument([document("ticket", "ticket"), document("pass", "boarding_pass")])?.id
    ).toBe("pass"));
  it("derives delay from estimated minus scheduled", () =>
    expect(
      delayMinutes({ ...flight, status: "delayed", estimated_departure_at: "2026-09-10T10:45:00Z" })
    ).toBe(45));
  it("uses estimated departure only for delayed status", () => {
    const changed = { ...flight, estimated_departure_at: "2026-09-10T10:45:00Z" };
    expect(effectiveDeparture(changed)).toBe(flight.scheduled_departure_at);
    expect(effectiveDeparture({ ...changed, status: "delayed" })).toBe("2026-09-10T10:45:00Z");
  });
  it("uses terminal status text instead of a countdown", () =>
    expect(flightCountdown({ ...flight, status: "landed" }, new Date("2026-09-10T00:00:00Z"))).toBe(
      "Landed"
    ));
  it("constructs a safely encoded public tracker URL", () =>
    expect(trackerUrl("AV 218")).toBe("https://www.flightaware.com/live/flight/AV218"));
  it("calculates boarding from the departure lead unless an exact time was supplied", () => {
    expect(resolveBoardingInstant("2026-09-10T10:00:00.000Z", null, 45)).toBe(
      "2026-09-10T09:15:00.000Z"
    );
    expect(resolveBoardingInstant("2026-09-10T10:00:00.000Z", "2026-09-10T09:05:00.000Z", 45)).toBe(
      "2026-09-10T09:05:00.000Z"
    );
  });
  it("shows every participant's seat in Everyone mode and only the focused traveler otherwise", () => {
    const travelers: Traveler[] = [
      { id: "one", trip_id: "t", display_name: "Asha", is_minor: false, created_at: "" },
      { id: "two", trip_id: "t", display_name: "Ravi", is_minor: false, created_at: "" }
    ];
    const details: FlightTraveler[] = [
      {
        id: "f:one",
        flight_leg_id: "f",
        traveler_id: "one",
        seat: "14A",
        boarding_group: null,
        ticket_number: null
      }
    ];
    expect(flightSeatLabels(travelers, details, null)).toEqual([
      { travelerId: "one", travelerName: "Asha", seat: "14A" },
      { travelerId: "two", travelerName: "Ravi", seat: null }
    ]);
    expect(flightSeatLabels(travelers, details, "two")).toEqual([
      { travelerId: "two", travelerName: "Ravi", seat: null }
    ]);
  });
});
