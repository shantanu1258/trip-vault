import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "./types";

const mocks = vi.hoisted(() => ({
  addTripCost: vi.fn(),
  addActivityMoment: vi.fn(),
  addCabStop: vi.fn(),
  listItinerary: vi.fn(),
  listActivityMoments: vi.fn(),
  listJourneyLegsForBooking: vi.fn(),
  listCabStopsForTrip: vi.fn()
}));

vi.mock("./api", () => ({
  addTripCost: mocks.addTripCost,
  listItinerary: mocks.listItinerary
}));
vi.mock("../activity-moments/api", () => ({
  addActivityMoment: mocks.addActivityMoment,
  listActivityMoments: mocks.listActivityMoments
}));
vi.mock("../workspace/api", () => ({
  addCabStop: mocks.addCabStop,
  listJourneyLegsForBooking: mocks.listJourneyLegsForBooking,
  listCabStopsForTrip: mocks.listCabStopsForTrip
}));

import { QuickAddCostForm } from "./QuickAddCostForm";

const trip: Trip = {
  id: "trip-1",
  title: "Delhi weekend",
  destination_summary: "Delhi",
  start_date: "2026-09-28",
  end_date: "2026-09-30",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-20T00:00:00.000Z",
  updated_at: "2026-09-20T00:00:00.000Z"
};

describe("QuickAddCostForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addTripCost.mockResolvedValue({ id: "cost-1" });
    mocks.addActivityMoment.mockResolvedValue({
      id: "moment-new",
      itinerary_item_id: "activity-1",
      moment_order: 100,
      title: "New Moment",
      location: null,
      starts_at: null,
      ends_at: null,
      timezone: "Asia/Kolkata",
      notes: null,
      source_planning_item_id: null
    });
    mocks.addCabStop.mockResolvedValue({
      id: "stop-new",
      journey_leg_id: "cab-leg-1",
      stop_order: 100,
      title: "Driver tip",
      location: null,
      arrives_at: null,
      departs_at: null,
      timezone: "Asia/Kolkata",
      notes: null,
      linked_itinerary_item_id: null
    });
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listActivityMoments.mockResolvedValue([]);
    mocks.listJourneyLegsForBooking.mockResolvedValue([]);
    mocks.listCabStopsForTrip.mockResolvedValue([]);
  });

  it("saves a compact cost in the trip currency with the requested quick categories", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <QuickAddCostForm
          trip={trip}
          travelers={[
            {
              id: "traveler-1",
              trip_id: trip.id,
              display_name: "Shantanu",
              is_minor: false,
              created_at: "2026-09-20T00:00:00.000Z"
            }
          ]}
          onClose={onClose}
          onSaved={onSaved}
        />
      </QueryClientProvider>
    );

    expect(screen.queryByLabelText("Currency")).not.toBeInTheDocument();
    expect(screen.queryByText(/Quick entry uses/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Stuff…")).toBeInTheDocument();
    expect(screen.getByLabelText("Category")).toHaveValue("other");
    expect(screen.getByRole("option", { name: "Snacks" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Gift" })).toBeInTheDocument();

    await user.type(screen.getByLabelText(/What was it for/), "Market gifts");
    await user.type(screen.getByLabelText("Amount"), "850");
    await user.selectOptions(screen.getByLabelText("Category"), "gift");
    await user.click(screen.getByRole("button", { name: "Save cost" }));

    await waitFor(() =>
      expect(mocks.addTripCost).toHaveBeenCalledWith({
        tripId: trip.id,
        title: "Market gifts",
        category: "gift",
        amountMinor: 85000,
        currencyCode: "INR",
        paymentStatus: "paid",
        participantTravelerIds: ["traveler-1"],
        bookingId: null,
        itineraryItemId: null,
        cabStopId: null,
        activityMomentId: null
      })
    );
    expect(onSaved).toHaveBeenCalledWith({ id: "cost-1" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("connects a quick cost to a selected activity Moment", async () => {
    mocks.listItinerary.mockResolvedValue([
      {
        id: "activity-1",
        trip_id: trip.id,
        booking_id: null,
        title: "Old Delhi walk",
        event_type: "activity",
        starts_at: "2026-09-28T04:00:00.000Z",
        ends_at: null,
        timezone: "Asia/Kolkata",
        location: null,
        notes: null,
        applies_to_all_travelers: true,
        created_at: ""
      }
    ]);
    mocks.listActivityMoments.mockResolvedValue([
      {
        id: "moment-1",
        itinerary_item_id: "activity-1",
        moment_order: 100,
        title: "Jalebi stop",
        location: null,
        starts_at: null,
        ends_at: null,
        timezone: "Asia/Kolkata",
        notes: null,
        source_planning_item_id: null
      }
    ]);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <QuickAddCostForm trip={trip} travelers={[]} onClose={vi.fn()} />
      </QueryClientProvider>
    );

    await user.type(screen.getByLabelText("What was it for?"), "Jalebi");
    await user.type(screen.getByLabelText("Amount"), "120");
    await user.click(screen.getByText("Connection (optional)"));
    await screen.findByRole("option", { name: "Old Delhi walk" });
    await user.selectOptions(screen.getByLabelText("Event"), "activity-1");
    await screen.findByRole("option", { name: "Jalebi stop" });
    await user.selectOptions(screen.getByLabelText("Moment (optional)"), "moment-1");
    await user.click(screen.getByRole("button", { name: "Save cost" }));

    await waitFor(() =>
      expect(mocks.addTripCost).toHaveBeenCalledWith(
        expect.objectContaining({
          itineraryItemId: "activity-1",
          activityMomentId: "moment-1",
          bookingId: null,
          cabStopId: null
        })
      )
    );
  });

  it("creates a new Moment from the cost name before connecting the cost", async () => {
    mocks.listItinerary.mockResolvedValue([
      {
        id: "activity-1",
        trip_id: trip.id,
        booking_id: null,
        title: "City walk",
        event_type: "activity",
        starts_at: "2026-09-28T04:00:00.000Z",
        ends_at: null,
        timezone: "Asia/Kolkata",
        location: null,
        notes: null,
        applies_to_all_travelers: true,
        created_at: ""
      }
    ]);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <QuickAddCostForm trip={trip} travelers={[]} onClose={vi.fn()} />
      </QueryClientProvider>
    );

    await user.type(screen.getByLabelText("What was it for?"), "Street snacks");
    await user.type(screen.getByLabelText("Amount"), "250");
    await user.click(screen.getByText("Connection (optional)"));
    await screen.findByRole("option", { name: "City walk" });
    await user.selectOptions(screen.getByLabelText("Event"), "activity-1");
    await user.selectOptions(screen.getByLabelText("Moment (optional)"), "Add as a new Moment");
    expect(
      screen.queryByText("The cost name will also become the new Moment name.")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save cost" }));

    await waitFor(() =>
      expect(mocks.addActivityMoment).toHaveBeenCalledWith({
        tripId: trip.id,
        itineraryItemId: "activity-1",
        title: "Street snacks",
        timezone: "Asia/Kolkata"
      })
    );
    expect(mocks.addTripCost).toHaveBeenCalledWith(
      expect.objectContaining({
        itineraryItemId: "activity-1",
        activityMomentId: "moment-new"
      })
    );
  });

  it("creates a new cab stop from the cost name before connecting the cost", async () => {
    mocks.listItinerary.mockResolvedValue([
      {
        id: "cab-1",
        trip_id: trip.id,
        booking_id: "cab-booking-1",
        title: "Airport cab",
        event_type: "cab",
        starts_at: "2026-09-28T04:00:00.000Z",
        ends_at: null,
        timezone: "Asia/Kolkata",
        location: null,
        notes: null,
        applies_to_all_travelers: true,
        created_at: ""
      }
    ]);
    mocks.listJourneyLegsForBooking.mockResolvedValue([{ id: "cab-leg-1", mode: "cab" }]);
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={client}>
        <QuickAddCostForm trip={trip} travelers={[]} onClose={vi.fn()} />
      </QueryClientProvider>
    );

    await user.type(screen.getByLabelText("What was it for?"), "Driver tip");
    await user.type(screen.getByLabelText("Amount"), "300");
    await user.click(screen.getByText("Connection (optional)"));
    await screen.findByRole("option", { name: "Airport cab" });
    await user.selectOptions(screen.getByLabelText("Event"), "cab-1");
    await screen.findByRole("option", { name: "Add as a new stop" });
    await user.selectOptions(screen.getByLabelText("Cab stop (optional)"), "Add as a new stop");
    await user.click(screen.getByRole("button", { name: "Save cost" }));

    await waitFor(() =>
      expect(mocks.addCabStop).toHaveBeenCalledWith({
        tripId: trip.id,
        journeyLegId: "cab-leg-1",
        title: "Driver tip",
        timezone: "Asia/Kolkata"
      })
    );
    expect(mocks.addTripCost).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "cab-booking-1",
        itineraryItemId: "cab-1",
        cabStopId: "stop-new"
      })
    );
  });
});
