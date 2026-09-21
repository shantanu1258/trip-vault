import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JourneyEssentials, stayDuration } from "./JourneyEssentials";
import type { JourneyLeg } from "./types";

const leg = {
  scheduled_departure_at: "2026-09-30T01:00:00Z",
  origin_timezone: "Asia/Singapore",
  boarding_lead_minutes: 60
} as JourneyLeg;
describe("type-specific booking essentials", () => {
  it("keeps unpaired facts full-width beside long journey instructions", () => {
    render(
      <JourneyEssentials
        layout="grid"
        leg={{
          ...leg,
          mode: "bus",
          details: {
            kind: "bus",
            boarding_point_details:
              "A long boarding address with meeting instructions that must take the full available row width",
            bus_class_or_layout: "Executive"
          }
        }}
      />
    );
    expect(screen.getByText("Boarding").parentElement).toHaveClass("col-span-2");
    expect(screen.getByText("Boarding point").parentElement).toHaveClass("col-span-2");
    expect(screen.getByText("Executive").parentElement).toHaveClass("col-span-2");
  });
  it("counts local calendar nights instead of elapsed hours, including DST", () => {
    expect(stayDuration("2026-09-27T07:00:00Z", "2026-09-29T23:00:00Z", "Asia/Singapore")).toBe(
      "4 days · 3 nights"
    );
    expect(stayDuration("2026-03-07T20:00:00Z", "2026-03-09T15:00:00Z", "America/New_York")).toBe(
      "3 days · 2 nights"
    );
    expect(stayDuration("2026-09-27T07:00:00Z", "2026-09-27T12:00:00Z", "Asia/Singapore")).toBe(
      "1 day · 0 nights"
    );
    expect(stayDuration("2026-09-27T07:00:00Z", "2026-09-28T04:00:00Z", "Asia/Singapore")).toBe(
      "2 days · 1 night"
    );
  });
  it("shows bus boarding instructions and computed boarding time", () => {
    render(
      <JourneyEssentials
        leg={{
          ...leg,
          mode: "bus",
          details: {
            kind: "bus",
            boarding_point_details: "Meet at exit D",
            dropoff_point_details: "Central station"
          }
        }}
      />
    );
    expect(screen.getByText(/8:00/)).toBeInTheDocument();
    expect(screen.getByText("Meet at exit D")).toBeInTheDocument();
    expect(screen.queryByText("Platform")).not.toBeInTheDocument();
  });
  it("keeps train boarding station, class, platform and status visible", () => {
    render(
      <JourneyEssentials
        leg={{
          ...leg,
          mode: "train",
          departure_platform: "4",
          details: {
            kind: "train",
            booked_from_name: "Central",
            travel_class: "AC",
            current_status: "Confirmed"
          }
        }}
      />
    );
    for (const text of ["Central", "AC", "Confirmed", "4"])
      expect(screen.getByText(text)).toBeInTheDocument();
  });
  it("shows ferry timing and accommodation without requesting a seat", () => {
    render(
      <JourneyEssentials
        leg={{
          ...leg,
          mode: "ferry",
          details: {
            kind: "ferry",
            ticket_timing: "open_return",
            seating: "free",
            vessel_name: "Sea Star"
          }
        }}
      />
    );
    expect(screen.getByText("open return")).toBeInTheDocument();
    expect(screen.getByText("free")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("gives cabs driver actions and vehicle identification", () => {
    render(
      <JourneyEssentials
        leg={{
          ...leg,
          mode: "cab",
          details: {
            kind: "cab",
            ride_type: "airport_transfer",
            luggage_count: 2,
            pickup_buffer_minutes: 30,
            driver_name: "Driver",
            driver_phone: "+919876543210",
            vehicle_registration: "AB123",
            pickup_instructions: "Exit 2"
          }
        }}
      />
    );
    expect(screen.getByRole("link", { name: "Call driver" })).toHaveAttribute(
      "href",
      "tel:+919876543210"
    );
    expect(screen.getByText("AB123")).toBeInTheDocument();
    expect(screen.getByText("Exit 2")).toBeInTheDocument();
    expect(screen.getByText("Airport transfer")).toBeInTheDocument();
    expect(screen.getByText("2 bag(s)")).toBeInTheDocument();
    expect(screen.getByText("30 min after landing")).toBeInTheDocument();
  });
});
