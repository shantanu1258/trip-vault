import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip } from "./types";
import type { Traveler } from "../workspace/types";

const mocks = vi.hoisted(() => ({
  listItinerary: vi.fn(),
  listItineraryParticipantIds: vi.fn(),
  updateItineraryItem: vi.fn(),
  addTripCost: vi.fn(),
  updateTripCost: vi.fn(),
  clearDraft: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({
  ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  )
}));
vi.mock("../../lib/forms/useFormDraft", () => ({
  useFormDraft: () => ({ formRef: { current: null }, clearDraft: mocks.clearDraft })
}));
vi.mock("../timeline/TimingFields", () => ({
  TimingFields: () => null,
  furthestEventTimezone: (_itinerary: ItineraryItem[], fallback: string) => fallback,
  readEventTiming: () => ({
    startsAt: "2026-09-28T04:00:00.000Z",
    endsAt: undefined,
    timezone: "Asia/Dubai",
    timingMode: "exact" as const,
    isAllDay: false,
    hasExplicitStartTime: true
  })
}));
vi.mock("../workspace/api", () => ({
  listItineraryParticipantIds: mocks.listItineraryParticipantIds
}));
vi.mock("./api", () => ({
  addItineraryItem: vi.fn(),
  addTripCost: mocks.addTripCost,
  archiveTrip: vi.fn(),
  deleteTripRecoverably: vi.fn(),
  listItinerary: mocks.listItinerary,
  updateItineraryItem: mocks.updateItineraryItem,
  updateTrip: vi.fn(),
  updateTripCost: mocks.updateTripCost
}));

import { AddCostForm, AddItineraryForm, TripSettingsForm } from "./TripForms";

const trip: Trip = {
  id: "trip-1",
  title: "Dubai trip",
  destination_summary: "Dubai",
  start_date: "2026-09-26",
  end_date: "2026-10-02",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const travelers: Traveler[] = [
  { id: "asha", trip_id: trip.id, display_name: "Asha", is_minor: false, created_at: "" },
  { id: "ravi", trip_id: trip.id, display_name: "Ravi", is_minor: false, created_at: "" }
];

const item: ItineraryItem = {
  id: "meal-1",
  trip_id: trip.id,
  booking_id: null,
  title: "Dinner",
  event_type: "meal",
  starts_at: "2026-09-28T04:00:00.000Z",
  ends_at: null,
  timezone: "Asia/Dubai",
  location: null,
  notes: null,
  applies_to_all_travelers: false,
  timing_mode: "exact",
  version: 4,
  created_at: "2026-09-01T00:00:00.000Z"
};

describe("AddItineraryForm participant scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listItinerary.mockResolvedValue([item]);
    mocks.listItineraryParticipantIds.mockResolvedValue(["asha", "ravi"]);
    mocks.updateItineraryItem.mockResolvedValue(item);
  });

  it("preserves an intentional Selected scope when every current traveler is selected", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddItineraryForm trip={trip} travelers={travelers} item={item} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("radio", { name: "Selected travelers" })).toBeChecked();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Asha" })).toBeChecked());
    expect(screen.getByRole("checkbox", { name: "Ravi" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateItineraryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: item.id,
          participantScope: "selected",
          travelerIds: ["asha", "ravi"]
        })
      )
    );
  });

  it("does not offer a generic edit form for a linked hotel milestone", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddItineraryForm
            trip={trip}
            travelers={travelers}
            item={{ ...item, booking_id: "hotel-1", event_type: "hotel_check_out" }}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Open the hotel booking to edit both milestones safely/)
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
  });

  it("keeps bus pickup and route editing inside the linked journey booking", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddItineraryForm
            trip={trip}
            travelers={travelers}
            item={{ ...item, booking_id: "bus-1", event_type: "bus" }}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(
      screen.getByText(/Pickup, drop-off, route, local times, and traveler seats belong/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Event name/i)).toHaveValue("Dinner");
    expect(screen.queryByLabelText("Location (optional)")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit bus route & times" })).toHaveAttribute(
      "href",
      `/trips/${trip.id}/bookings/bus-1?editJourney=true`
    );
  });

  it("edits a flight event name and opens its journey booking for managed details", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    const flightItem = {
      ...item,
      id: "flight-1",
      booking_id: "flight-booking-1",
      event_type: "flight" as const,
      title: "Flight to Delhi",
      applies_to_all_travelers: true
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddItineraryForm trip={trip} travelers={travelers} item={flightItem} onClose={onClose} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const name = screen.getByLabelText(/Event name/i);
    await user.clear(name);
    await user.type(name, "Morning flight to Delhi");
    await user.click(screen.getByRole("button", { name: "Save event name" }));

    await waitFor(() =>
      expect(mocks.updateItineraryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: flightItem.id,
          bookingId: flightItem.booking_id,
          eventType: "flight",
          title: "Morning flight to Delhi"
        })
      )
    );
    expect(screen.getByRole("link", { name: "Edit flight route & times" })).toHaveAttribute(
      "href",
      `/trips/${trip.id}/bookings/${flightItem.booking_id}?editJourney=true`
    );
  });
});

describe("AddCostForm optional expense splitting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addTripCost.mockResolvedValue({ id: "cost-1" });
  });

  it("hides traveler splitting and applies a new cost to everyone when disabled", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddCostForm
            trip={{ ...trip, expense_splitting_enabled: false }}
            travelers={travelers}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.queryByRole("radio", { name: "Selected travelers" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/What was it for/i), "Airport transfer");
    await user.type(screen.getByLabelText("Amount"), "1200");
    await user.click(screen.getByRole("button", { name: "Save cost" }));

    await waitFor(() =>
      expect(mocks.addTripCost).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: trip.id,
          participantTravelerIds: ["asha", "ravi"]
        })
      )
    );
  });

  it("edits existing expense travelers even with trip splitting disabled, and rejects an empty selection", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.updateTripCost.mockResolvedValue({ id: "cost-1" });
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddCostForm
            trip={{ ...trip, expense_splitting_enabled: false }}
            travelers={travelers}
            cost={{
              id: "cost-1",
              trip_id: trip.id,
              title: "Tickets",
              category: "activity",
              amount_minor: 300000,
              currency_code: "INR",
              payment_status: "paid",
              created_at: "",
              booking_id: "booking-1",
              itinerary_item_id: null,
              notes: null,
              version: 2,
              participants: [{ traveler_id: "asha", share_amount_minor: null }]
            }}
            onClose={onClose}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(screen.getByRole("checkbox", { name: "Asha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ravi" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Asha" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose at least one traveler");
    expect(mocks.updateTripCost).not.toHaveBeenCalled();
    await user.click(screen.getByRole("checkbox", { name: "Ravi" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(mocks.updateTripCost).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "cost-1",
          bookingId: "booking-1",
          version: 2,
          participantTravelerIds: ["ravi"],
          amountMinor: 300000
        })
      )
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("shows traveler controls when expense splitting is enabled", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddCostForm
            trip={{ ...trip, expense_splitting_enabled: true }}
            travelers={travelers}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("radio", { name: "Selected travelers" })).toBeInTheDocument();
  });
});

describe("TripSettingsForm lifecycle actions", () => {
  it("keeps recoverable lifecycle actions without the temporary permanent-delete tool", () => {
    const onArchived = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <TripSettingsForm trip={trip} onClose={vi.fn()} onArchived={onArchived} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("button", { name: "Archive trip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move to Recently deleted" })).toBeInTheDocument();
    expect(screen.queryByText("Temporary testing tool")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Permanently delete/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm permanent trip deletion")).not.toBeInTheDocument();
    expect(onArchived).not.toHaveBeenCalled();
  });
});
