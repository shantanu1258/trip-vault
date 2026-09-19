import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyLeg, JourneyLegTraveler, Traveler } from "./types";

const mocks = vi.hoisted(() => ({
  listJourneyLegTravelers: vi.fn(),
  setJourneyLegTravelerDetails: vi.fn()
}));

vi.mock("./api", () => ({
  listJourneyLegTravelers: mocks.listJourneyLegTravelers,
  setJourneyLegTravelerDetails: mocks.setJourneyLegTravelerDetails
}));

import { JourneyTravelerBadges, JourneyTravelerDetails } from "./JourneyTravelerDetails";

const travelers: Traveler[] = [
  {
    id: "traveler-1",
    trip_id: "trip-1",
    display_name: "Shantanu",
    is_minor: false,
    created_at: "2026-09-01T00:00:00.000Z"
  },
  {
    id: "traveler-2",
    trip_id: "trip-1",
    display_name: "Rahul",
    is_minor: false,
    created_at: "2026-09-01T00:00:00.000Z"
  }
];

const busLeg: JourneyLeg = {
  id: "leg-1",
  booking_id: "booking-1",
  segment_order: 0,
  mode: "bus",
  operator_name: "RedBus",
  service_number: "RB1",
  origin_code: null,
  origin_name: "Singapore",
  origin_country_code: "SG",
  origin_timezone: "Asia/Singapore",
  destination_code: null,
  destination_name: "Kuala Lumpur",
  destination_country_code: "MY",
  destination_timezone: "Asia/Kuala_Lumpur",
  scheduled_departure_at: "2026-09-30T01:00:00.000Z",
  scheduled_arrival_at: "2026-09-30T06:51:00.000Z",
  boarding_at: null,
  boarding_lead_minutes: null,
  departure_platform: null,
  arrival_platform: null,
  coach_or_cabin: null,
  seat: null,
  details: { kind: "bus" },
  status_note: null
};

const allocations: JourneyLegTraveler[] = [
  {
    id: "leg-1:traveler-1",
    journey_leg_id: "leg-1",
    traveler_id: "traveler-1",
    seat_or_berth: "5",
    coach_or_cabin: "Executive",
    passenger_reference: "85854178"
  },
  {
    id: "leg-1:traveler-2",
    journey_leg_id: "leg-1",
    traveler_id: "traveler-2",
    seat_or_berth: "9",
    coach_or_cabin: "Executive",
    passenger_reference: "85854179"
  }
];

function withClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mocks.listJourneyLegTravelers.mockReset();
  mocks.setJourneyLegTravelerDetails.mockReset().mockResolvedValue(allocations[0]);
});

describe("journey traveler details", () => {
  it("waits for saved allocations before mounting editable inputs and saves the hydrated passenger row", async () => {
    let resolveRows!: (rows: JourneyLegTraveler[]) => void;
    mocks.listJourneyLegTravelers.mockReturnValue(
      new Promise<JourneyLegTraveler[]>((resolve) => {
        resolveRows = resolve;
      })
    );
    withClient(
      <JourneyTravelerDetails tripId="trip-1" legs={[busLeg]} travelers={[travelers[0]]} canEdit />
    );

    expect(screen.getByRole("status")).toHaveTextContent("Loading passenger details");
    expect(screen.queryByRole("textbox", { name: "Seat" })).not.toBeInTheDocument();
    resolveRows([allocations[0]]);

    const seat = await screen.findByRole("textbox", { name: "Seat" });
    expect(seat).toHaveValue("5");
    expect(screen.queryByRole("textbox", { name: "Coach / section" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Passenger PNR / reference" })).toHaveValue(
      "85854178"
    );

    await userEvent.clear(seat);
    await userEvent.type(seat, "12");
    await userEvent.click(screen.getByRole("button", { name: "Save bus details for Shantanu" }));

    expect(mocks.setJourneyLegTravelerDetails).toHaveBeenCalledWith({
      tripId: "trip-1",
      journeyLegId: "leg-1",
      travelerId: "traveler-1",
      seatOrBerth: "12",
      coachOrCabin: "Executive",
      passengerReference: "85854178"
    });
  });

  it("shows only the focused traveler's allocation while Everyone gets named allocations", async () => {
    mocks.listJourneyLegTravelers.mockResolvedValue(allocations);
    const view = withClient(
      <JourneyTravelerBadges
        tripId="trip-1"
        leg={busLeg}
        travelers={travelers}
        focusedTravelerId="traveler-2"
      />
    );

    expect(await screen.findByText("Rahul · Seat 9")).toBeInTheDocument();
    expect(screen.queryByText(/85854179|Passenger PNR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Shantanu.*Seat 5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Executive/)).not.toBeInTheDocument();

    view.unmount();
    withClient(<JourneyTravelerBadges tripId="trip-1" leg={busLeg} travelers={travelers} />);
    expect(await screen.findByText(/Shantanu.*Seat 5/)).toBeInTheDocument();
    expect(screen.getByText(/Rahul.*Seat 9/)).toBeInTheDocument();
  });

  it("does not ask for a ferry seat unless seating is assigned and never asks cab riders for seats", async () => {
    mocks.listJourneyLegTravelers.mockResolvedValue(allocations);
    const freeFerry: JourneyLeg = {
      ...busLeg,
      id: "ferry-1",
      mode: "ferry",
      details: { kind: "ferry", seating: "free" }
    };
    const view = withClient(
      <JourneyTravelerDetails
        tripId="trip-1"
        legs={[freeFerry]}
        travelers={[travelers[0]]}
        canEdit
      />
    );

    expect(await screen.findByRole("textbox", { name: "Passenger reference" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Seat / berth" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: "Cabin / accommodation" })
    ).not.toBeInTheDocument();

    view.unmount();
    const assignedFerry = {
      ...freeFerry,
      id: "ferry-2",
      details: { kind: "ferry" as const, seating: "assigned" as const }
    };
    const assignedView = withClient(
      <JourneyTravelerDetails
        tripId="trip-1"
        legs={[assignedFerry]}
        travelers={[travelers[0]]}
        canEdit
      />
    );
    expect(await screen.findByRole("textbox", { name: "Seat / berth" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Cabin / accommodation" })).toBeInTheDocument();

    assignedView.unmount();
    const cabView = withClient(
      <JourneyTravelerDetails
        tripId="trip-1"
        legs={[
          { ...busLeg, id: "cab-1", mode: "cab", details: { kind: "cab", ride_type: "local" } }
        ]}
        travelers={travelers}
        canEdit
      />
    );
    await waitFor(() => expect(cabView.container).toBeEmptyDOMElement());
  });

  it("keeps coach alongside berth and passenger reference for train travelers", async () => {
    mocks.listJourneyLegTravelers.mockResolvedValue(allocations);
    const trainLeg: JourneyLeg = {
      ...busLeg,
      id: "train-1",
      mode: "train",
      details: { kind: "train" }
    };
    withClient(
      <JourneyTravelerDetails
        tripId="trip-1"
        legs={[trainLeg]}
        travelers={[travelers[0]]}
        canEdit
      />
    );

    expect(await screen.findByRole("textbox", { name: "Seat / berth" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Coach" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Passenger PNR / reference" })).toBeInTheDocument();
  });
});
