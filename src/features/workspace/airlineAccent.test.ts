import { describe, expect, it } from "vitest";
import type { FlightLeg, TripAirline } from "./types";
import { airlineAccentStyle, airlineForFlight } from "./airlineAccent";

function airline(id: string, name: string, brandColor: string): TripAirline {
  return {
    id,
    trip_id: "trip-1",
    name,
    iata_code: null,
    icao_code: null,
    check_in_url_template: null,
    manage_booking_url_template: null,
    status_url_template: null,
    tracker_url_template: null,
    brand_color: brandColor,
    metadata_source: "catalog",
    source_catalog_key: null,
    source_config_version: 1,
    version: 1
  };
}

function leg(overrides: Partial<FlightLeg>): FlightLeg {
  return {
    id: "flight-1",
    booking_id: "booking-1",
    segment_order: 0,
    airline_name: "Air India",
    flight_number: "AI 101",
    departure_airport_code: "BLR",
    departure_airport_name: "Bengaluru",
    arrival_airport_code: "DEL",
    arrival_airport_name: "Delhi",
    scheduled_departure_at: "2026-09-28T03:30:00.000Z",
    scheduled_arrival_at: "2026-09-28T06:00:00.000Z",
    estimated_departure_at: null,
    estimated_arrival_at: null,
    actual_departure_at: null,
    actual_arrival_at: null,
    departure_timezone: "Asia/Kolkata",
    arrival_timezone: "Asia/Kolkata",
    boarding_at: null,
    departure_terminal: null,
    departure_gate: null,
    arrival_terminal: null,
    arrival_gate: null,
    baggage_claim: null,
    status: "scheduled",
    status_note: null,
    status_updated_by: "user-1",
    status_updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides
  };
}

describe("airline accents", () => {
  it("uses the linked airline identity before a same-named fallback", () => {
    const linked = airline("airline-linked", "Different display name", "#d71920");
    const sameName = airline("airline-name", "Air India", "#142f31");

    expect(airlineForFlight(leg({ marketing_airline_id: linked.id }), [sameName, linked])).toBe(
      linked
    );
  });

  it("falls back to a case-insensitive airline name for older flight data", () => {
    const matching = airline("airline-1", "air india", "#d71920");

    expect(airlineForFlight(leg({ marketing_airline_id: null }), [matching])).toBe(matching);
  });

  it("exposes a CSS variable only when an accent was configured", () => {
    expect(airlineAccentStyle("#d71920")).toEqual({ "--airline-accent": "#d71920" });
    expect(airlineAccentStyle(null)).toBeUndefined();
  });
});
