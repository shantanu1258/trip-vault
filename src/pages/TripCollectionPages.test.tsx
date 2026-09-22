import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Trip, TripCost } from "../features/trips/types";
import type { Booking, Traveler, VaultDocument } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  updateTripExpenseSplitting: vi.fn(),
  listCosts: vi.fn().mockResolvedValue([]),
  listBookings: vi.fn().mockResolvedValue([]),
  listFlightLegsForTrip: vi.fn().mockResolvedValue([]),
  listJourneyLegsForTrip: vi.fn().mockResolvedValue([]),
  listTripBookingTravelers: vi.fn().mockResolvedValue([]),
  listItinerary: vi.fn().mockResolvedValue([]),
  listTravelers: vi.fn().mockResolvedValue([]),
  listMembers: vi.fn().mockResolvedValue([]),
  listVaultDocuments: vi.fn().mockResolvedValue([]),
  listTripEventDocumentReferences: vi.fn().mockResolvedValue([])
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("../features/trips/api", async () => {
  const actual =
    await vi.importActual<typeof import("../features/trips/api")>("../features/trips/api");
  return {
    ...actual,
    getTrip: mocks.getTrip,
    listCosts: mocks.listCosts,
    listItinerary: mocks.listItinerary,
    updateTripExpenseSplitting: mocks.updateTripExpenseSplitting
  };
});
vi.mock("../features/sync/localSync", () => ({
  localProfileId: vi.fn().mockResolvedValue("owner-user")
}));
vi.mock("../features/workspace/api", async () => {
  const actual = await vi.importActual<typeof import("../features/workspace/api")>(
    "../features/workspace/api"
  );
  return {
    ...actual,
    listBookings: mocks.listBookings,
    listFlightLegsForTrip: mocks.listFlightLegsForTrip,
    listJourneyLegsForTrip: mocks.listJourneyLegsForTrip,
    listTripBookingTravelers: mocks.listTripBookingTravelers,
    listTravelers: mocks.listTravelers,
    listMembers: mocks.listMembers,
    listVaultDocuments: mocks.listVaultDocuments
  };
});
vi.mock("../features/workspace/tripRelationships", () => ({
  listCurrentAccountTravelerIds: vi.fn().mockResolvedValue([]),
  listTripEventDocumentReferences: mocks.listTripEventDocumentReferences
}));

import { TripDocumentsPage } from "./TripDocumentsPage";
import { TripExpensesPage } from "./TripExpensesPage";
import { TripReservationsPage } from "./TripReservationsPage";

const trip: Trip = {
  id: "trip-1",
  title: "Large trip",
  destination_summary: "Several places",
  start_date: "2026-09-18",
  end_date: "2026-10-20",
  primary_timezone: "UTC",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z"
};

function booking(index: number): Booking {
  return {
    id: `booking-${index}`,
    trip_id: trip.id,
    type: index <= 10 ? "flight" : "hotel",
    title: `Reservation ${index}`,
    provider: index <= 10 ? "Aster Air" : "City Hotel",
    reference_code: `REF${index}`,
    start_at: new Date(Date.UTC(2026, 8, 17 + index, 5)).toISOString(),
    end_at: null,
    source_timezone: "UTC",
    location: null,
    details: {},
    created_at: "2026-09-01T00:00:00Z"
  };
}

const travelers: Traveler[] = [
  {
    id: "traveler-1",
    trip_id: trip.id,
    display_name: "Shantanu",
    is_minor: false,
    created_at: "2026-09-01T00:00:00Z"
  },
  {
    id: "traveler-2",
    trip_id: trip.id,
    display_name: "Shubham",
    is_minor: false,
    created_at: "2026-09-01T00:00:00Z"
  }
];

function document(id: string, title: string, travelerIds: string[]): VaultDocument {
  return {
    id,
    trip_id: trip.id,
    booking_id: null,
    flight_leg_id: null,
    traveler_id: travelerIds[0] ?? null,
    assignment_mode: travelerIds.length ? "selected" : "shared",
    traveler_ids: travelerIds,
    title,
    category: "flight",
    purpose: "ticket",
    short_label: null,
    visibility: "trip",
    current_version_id: null,
    updated_at: "2026-09-15T00:00:00Z"
  };
}

function renderRoute(element: React.ReactNode, path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trips/:tripId/reservations" element={element} />
          <Route path="/trips/:tripId/documents" element={element} />
          <Route path="/trips/:tripId/expenses" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("large trip collection pages", () => {
  it("separates all transport modes and preserves legacy journey filters", async () => {
    mocks.getTrip.mockResolvedValue(trip);
    const modes = ["train", "bus", "ferry", "cab", "transport"] as const;
    mocks.listBookings.mockResolvedValue(
      modes.map((type, index) => ({ ...booking(index + 1), type, title: `${type} booking` }))
    );
    renderRoute(<TripReservationsPage />, "/trips/trip-1/reservations?category=journey");
    expect(await screen.findByText("bus booking")).toBeVisible();
    for (const [index, label] of [
      "Trains",
      "Buses",
      "Ferries",
      "Cabs",
      "Other transport"
    ].entries()) {
      await userEvent.click(screen.getByRole("button", { name: `${label} 1` }));
      expect(screen.getByText(`${modes[index]} booking`)).toBeVisible();
      expect(
        screen.queryByText(`${modes[(index + 1) % modes.length]} booking`)
      ).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/Ground & water/)).not.toBeInTheDocument();
  });

  it("shows every reservation in the focused list and filters it by category", async () => {
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listBookings.mockResolvedValue(
      Array.from({ length: 15 }, (_, index) => booking(index + 1))
    );

    renderRoute(<TripReservationsPage />, "/trips/trip-1/reservations?category=flight");

    expect(await screen.findByText("Reservation 1")).toBeInTheDocument();
    expect(screen.queryByText("Reservation 15")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stays 5" }));
    expect(screen.getByText("Reservation 15")).toBeInTheDocument();
    expect(screen.queryByText("Reservation 1")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All 15" }));
    expect(screen.getByText("Reservation 1")).toBeInTheDocument();
    expect(screen.getByText("Reservation 15")).toBeInTheDocument();
  });

  it("shows complete document names and filters shared files with a selected traveler", async () => {
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue(travelers);
    mocks.listVaultDocuments.mockResolvedValue([
      document("shared", "Everyone complete flight ticket name", []),
      document("mine", "Shantanu complete boarding document name", ["traveler-1"]),
      document("other", "Shubham complete private ticket name", ["traveler-2"])
    ]);

    renderRoute(<TripDocumentsPage />, "/trips/trip-1/documents");

    expect(await screen.findByText("Shubham complete private ticket name")).toBeInTheDocument();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter documents by traveler" }),
      "traveler-1"
    );
    expect(screen.getByText("Everyone complete flight ticket name")).toBeInTheDocument();
    expect(screen.getByText("Shantanu complete boarding document name")).toBeInTheDocument();
    expect(screen.queryByText("Shubham complete private ticket name")).not.toBeInTheDocument();
  });
  it("opens the category linked from trip details and lets the user clear it", async () => {
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue(travelers);
    mocks.listBookings.mockResolvedValue([{ ...booking(1), type: "bus" }]);
    mocks.listVaultDocuments.mockResolvedValue([
      { ...document("flight", "Flight ticket", []), category: "flight" },
      { ...document("hotel", "Hotel confirmation", []), category: "hotel" },
      { ...document("bus", "Bus ticket", []), category: "transport", booking_id: "booking-1" }
    ]);
    renderRoute(<TripDocumentsPage />, "/trips/trip-1/documents?category=flight");
    expect(await screen.findByText("Flight ticket")).toBeVisible();
    expect(screen.queryByText("Hotel confirmation")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter documents by category" })).toHaveValue(
      "flight"
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter documents by category" }),
      "all"
    );
    expect(screen.getByText("Hotel confirmation")).toBeVisible();
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter documents by category" }),
      "bus"
    );
    expect(screen.getByText("Bus ticket")).toBeVisible();
    expect(screen.queryByText("Hotel confirmation")).not.toBeInTheDocument();
  });

  it("shows expenses on a dedicated page and filters the itemized list", async () => {
    let finishSplittingUpdate!: (updated: Trip) => void;
    mocks.updateTripExpenseSplitting.mockImplementationOnce(
      () =>
        new Promise<Trip>((resolve) => {
          finishSplittingUpdate = resolve;
        })
    );
    const costs: TripCost[] = [
      {
        id: "cost-food",
        trip_id: trip.id,
        booking_id: null,
        itinerary_item_id: null,
        title: "Museum lunch",
        category: "food",
        amount_minor: 250000,
        currency_code: "INR",
        payment_status: "paid",
        paid_by_traveler_id: "traveler-1",
        participants: [{ traveler_id: "traveler-1", share_amount_minor: 250000 }],
        notes: null,
        created_at: "2026-09-20T00:00:00Z"
      },
      {
        id: "cost-hotel",
        trip_id: trip.id,
        booking_id: null,
        itinerary_item_id: null,
        title: "Harbour hotel",
        category: "hotel",
        amount_minor: 900000,
        currency_code: "INR",
        payment_status: "planned",
        paid_by_traveler_id: null,
        participants: [{ traveler_id: "traveler-2", share_amount_minor: null }],
        notes: null,
        created_at: "2026-09-19T00:00:00Z"
      }
    ];
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listCosts.mockResolvedValue(costs);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listBookings.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue(travelers);
    mocks.listMembers.mockResolvedValue([
      {
        user_id: "owner-user",
        role: "owner",
        participation_type: "traveler",
        joined_at: "2026-09-01T00:00:00Z",
        display_name: "Shantanu"
      }
    ]);

    renderRoute(<TripExpensesPage />, "/trips/trip-1/expenses");

    expect(await screen.findByRole("heading", { name: "Expenses" })).toBeVisible();
    expect(screen.getByRole("button", { name: "View details for Museum lunch" })).toBeVisible();
    expect(screen.getByRole("button", { name: "View details for Harbour hotel" })).toBeVisible();

    await userEvent.click(screen.getByRole("checkbox", { name: "Enable expense splitting" }));
    expect(screen.getByRole("status", { name: "Saving expense splitting setting" })).toBeVisible();
    await act(async () => {
      finishSplittingUpdate({ ...trip, expense_splitting_enabled: true });
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Saving expense splitting setting" })
      ).not.toBeInTheDocument()
    );

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter expenses by category" }),
      "food"
    );
    const foodTotal = screen.getByText("Food total").closest(".rounded-xl");
    expect(within(foodTotal as HTMLElement).getByText("₹2,500.00")).toBeVisible();
    expect(within(foodTotal as HTMLElement).getByText("₹2,500.00")).toHaveClass("text-sm");
    expect(within(foodTotal as HTMLElement).getByText("₹11,500.00")).toBeVisible();
    expect(screen.getByRole("button", { name: "View details for Museum lunch" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "View details for Harbour hotel" })
    ).not.toBeInTheDocument();

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter expenses by category" }),
      "all"
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Filter expenses by traveler" }),
      "traveler-2"
    );
    const shubhamTotal = screen.getByText("Shubham total").closest(".rounded-xl");
    expect(within(shubhamTotal as HTMLElement).getByText("₹9,000.00")).toBeVisible();
    expect(screen.getByRole("button", { name: "View details for Harbour hotel" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "View details for Museum lunch" })
    ).not.toBeInTheDocument();
  });
});
