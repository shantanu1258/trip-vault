import { describe, expect, it } from "vitest";
import { validateNextFlightConnection } from "./AddFlightConnectionForm";
import type { FlightLeg } from "./types";

const lastLeg: FlightLeg = {
  id: "leg-1",
  booking_id: "booking-1",
  segment_order: 0,
  airline_name: "Air India",
  flight_number: "AI101",
  departure_airport_code: "BLR",
  departure_airport_name: "Kempegowda International Airport",
  departure_country_code: "IN",
  arrival_airport_code: "DEL",
  arrival_airport_name: "Indira Gandhi International Airport",
  arrival_country_code: "IN",
  scheduled_departure_at: "2026-09-26T02:00:00.000Z",
  scheduled_arrival_at: "2026-09-26T05:00:00.000Z",
  estimated_departure_at: null,
  estimated_arrival_at: null,
  actual_departure_at: null,
  actual_arrival_at: null,
  departure_timezone: "Asia/Kolkata",
  arrival_timezone: "Asia/Kolkata",
  boarding_at: null,
  journey_scope: "domestic",
  departure_terminal: null,
  departure_gate: null,
  arrival_terminal: null,
  arrival_gate: null,
  baggage_claim: null,
  status: "scheduled",
  status_note: null,
  status_updated_by: "user-1",
  status_updated_at: "2026-09-01T00:00:00.000Z"
};

describe("add-flight connection validation", () => {
  it("accepts the prior arrival airport as the next origin", () => {
    expect(() =>
      validateNextFlightConnection(lastLeg, {
        departureCode: "DEL",
        departureName: "Indira Gandhi International Airport",
        departureAt: "2026-09-26T06:00:00.000Z",
        arrivalAt: "2026-09-26T08:00:00.000Z",
        arrivalCountryCode: "IN",
        journeyScope: "domestic"
      })
    ).not.toThrow();
  });

  it("rejects a disconnected departure airport", () => {
    expect(() =>
      validateNextFlightConnection(lastLeg, {
        departureCode: "BOM",
        departureName: "Chhatrapati Shivaji Maharaj International Airport",
        departureAt: "2026-09-26T06:00:00.000Z",
        arrivalAt: "2026-09-26T08:00:00.000Z",
        arrivalCountryCode: "IN",
        journeyScope: "domestic"
      })
    ).toThrow(/where the previous flight arrives/i);
  });

  it("requires a positive connection interval", () => {
    expect(() =>
      validateNextFlightConnection(lastLeg, {
        departureCode: "DEL",
        departureName: "Indira Gandhi International Airport",
        departureAt: lastLeg.scheduled_arrival_at,
        arrivalAt: "2026-09-26T08:00:00.000Z",
        arrivalCountryCode: "IN",
        journeyScope: "domestic"
      })
    ).toThrow(/depart after/i);
  });

  it("rejects a foreign destination on a domestic connection", () => {
    expect(() =>
      validateNextFlightConnection(lastLeg, {
        departureCode: "DEL",
        departureName: "Indira Gandhi International Airport",
        departureAt: "2026-09-26T06:00:00.000Z",
        arrivalAt: "2026-09-26T08:00:00.000Z",
        arrivalCountryCode: "AE",
        journeyScope: "domestic"
      })
    ).toThrow(/choose International/i);
  });

  it("compares normalized airport names when old legs have no code", () => {
    const withoutCodes = { ...lastLeg, arrival_airport_code: null };
    expect(() =>
      validateNextFlightConnection(withoutCodes, {
        departureCode: "",
        departureName: "Indira-Gandhi International Airport",
        departureAt: "2026-09-26T06:00:00.000Z",
        arrivalAt: "2026-09-26T08:00:00.000Z",
        arrivalCountryCode: "IN",
        journeyScope: "domestic"
      })
    ).not.toThrow();
  });
});
