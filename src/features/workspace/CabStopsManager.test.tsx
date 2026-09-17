import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CabStop, JourneyLeg } from "./types";

const mocks = vi.hoisted(() => ({
  addCabStop: vi.fn(),
  archiveCabStop: vi.fn(),
  listCabStopsForTrip: vi.fn(),
  reorderCabStops: vi.fn(),
  updateCabStop: vi.fn(),
  saveOptionalCostForCreatedEvent: vi.fn(),
  confirm: vi.fn()
}));

vi.mock("../../components/ConfirmDialogProvider", () => ({
  useConfirmDialog: () => mocks.confirm
}));
vi.mock("./api", () => ({
  addCabStop: mocks.addCabStop,
  archiveCabStop: mocks.archiveCabStop,
  listCabStopsForTrip: mocks.listCabStopsForTrip,
  reorderCabStops: mocks.reorderCabStops,
  saveOptionalCostForCreatedEvent: mocks.saveOptionalCostForCreatedEvent,
  updateCabStop: mocks.updateCabStop
}));

import { CabStopsManager } from "./CabStopsManager";

const leg: JourneyLeg = {
  id: "leg-1",
  booking_id: "booking-1",
  segment_order: 0,
  mode: "cab",
  operator_name: "Driver",
  service_number: null,
  origin_code: null,
  origin_name: "Hotel",
  origin_country_code: null,
  origin_timezone: "Asia/Kolkata",
  destination_code: null,
  destination_name: "Hotel",
  destination_country_code: null,
  destination_timezone: "Asia/Kolkata",
  scheduled_departure_at: "2026-09-28T03:30:00.000Z",
  scheduled_arrival_at: "2026-09-28T12:30:00.000Z",
  boarding_at: null,
  boarding_lead_minutes: null,
  departure_platform: null,
  arrival_platform: null,
  coach_or_cabin: null,
  seat: null,
  details: { kind: "cab", ride_type: "hourly" },
  status_note: null
};

function stop(id: string, order: number, title: string): CabStop {
  return {
    id,
    journey_leg_id: leg.id,
    stop_order: order,
    title,
    location: null,
    arrives_at: null,
    departs_at: null,
    timezone: "Asia/Kolkata",
    notes: null,
    linked_itinerary_item_id: null
  };
}

function renderManager() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <CabStopsManager
        tripId="trip-1"
        leg={leg}
        itinerary={[]}
        costs={[]}
        currencyCode="INR"
        eventTimezone="Asia/Kolkata"
        participantTravelerIds={["traveler-1"]}
        editable
      />
    </QueryClientProvider>
  );
  return user;
}

describe("CabStopsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCabStopsForTrip.mockResolvedValue([]);
    mocks.addCabStop.mockResolvedValue(stop("stop-1", 100, "Museum"));
    mocks.reorderCabStops.mockResolvedValue([
      stop("stop-2", 100, "Lunch"),
      stop("stop-1", 200, "Museum")
    ]);
    mocks.saveOptionalCostForCreatedEvent.mockResolvedValue(undefined);
  });

  it("adds an intermediate stop without creating another journey", async () => {
    const user = renderManager();
    await screen.findByText(/No intermediate stops yet/i);
    await user.click(screen.getByRole("button", { name: "Add stop" }));
    expect(screen.queryByLabelText(/Time zone/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Stop name/), "Museum");
    await user.type(screen.getByLabelText("Place"), "National Museum");
    await user.click(screen.getByRole("button", { name: "Add stop" }));
    await waitFor(() =>
      expect(mocks.addCabStop).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: "trip-1",
          journeyLegId: leg.id,
          title: "Museum",
          location: "National Museum",
          timezone: "Asia/Kolkata"
        })
      )
    );
  });

  it("keeps explicit stop ordering controls", async () => {
    mocks.listCabStopsForTrip.mockResolvedValue([
      stop("stop-1", 100, "Museum"),
      stop("stop-2", 200, "Lunch")
    ]);
    const user = renderManager();
    await screen.findByText("Lunch");
    expect(within(screen.getByLabelText("Actions for Lunch")).getAllByRole("button")).toHaveLength(
      4
    );
    await user.click(screen.getByRole("button", { name: "Move Lunch earlier" }));
    await waitFor(() =>
      expect(mocks.reorderCabStops).toHaveBeenCalledWith(
        "trip-1",
        expect.arrayContaining([expect.objectContaining({ id: "stop-1" })]),
        "stop-2",
        "up"
      )
    );

    await user.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect(screen.getByRole("listitem", { name: "Cab stop 2: Lunch" })).toHaveAttribute(
      "aria-current",
      "true"
    );
    expect(screen.getByRole("form", { name: "Edit cab stop" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edit stop" })).toHaveClass("text-xl");
  });
});
