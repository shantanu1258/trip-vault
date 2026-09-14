import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip, TripCost } from "../features/trips/types";
import type { Traveler } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  deriveAlerts: vi.fn().mockReturnValue([]),
  getSavedTripFocus: vi.fn().mockResolvedValue(null),
  listBookings: vi.fn().mockResolvedValue([]),
  listCosts: vi.fn(),
  listFlightLegsForTrip: vi.fn().mockResolvedValue([]),
  listIncomingTripOffers: vi.fn().mockResolvedValue([]),
  listItinerary: vi.fn(),
  listRequirements: vi.fn().mockResolvedValue([]),
  listTravelers: vi.fn(),
  listTrips: vi.fn(),
  listVaultDocuments: vi.fn().mockResolvedValue([]),
  loadAlertInputs: vi.fn().mockResolvedValue({}),
  respondToTripOffer: vi.fn(),
  saveTripFocus: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../features/alerts/engine", () => ({ deriveAlerts: mocks.deriveAlerts }));
vi.mock("../features/alerts/load", () => ({ loadAlertInputs: mocks.loadAlertInputs }));
vi.mock("../features/trips/api", () => ({
  getSavedTripFocus: mocks.getSavedTripFocus,
  listCosts: mocks.listCosts,
  listItinerary: mocks.listItinerary,
  listTrips: mocks.listTrips,
  saveTripFocus: mocks.saveTripFocus
}));
vi.mock("../features/workspace/api", () => ({
  listBookings: mocks.listBookings,
  listFlightLegsForTrip: mocks.listFlightLegsForTrip,
  listIncomingTripOffers: mocks.listIncomingTripOffers,
  listRequirements: mocks.listRequirements,
  listTravelers: mocks.listTravelers,
  listVaultDocuments: mocks.listVaultDocuments,
  respondToTripOffer: mocks.respondToTripOffer
}));

import { HomePage } from "./HomePage";

const trip: Trip = {
  id: "trip-1",
  title: "October escape",
  destination_summary: "Dubai and London",
  start_date: "2026-09-26",
  end_date: "2026-10-12",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const itineraryItem: ItineraryItem = {
  id: "activity-1",
  trip_id: trip.id,
  booking_id: null,
  title: "Museum visit",
  event_type: "activity",
  starts_at: "2026-09-28T04:00:00.000Z",
  ends_at: null,
  timezone: "Asia/Dubai",
  location: null,
  notes: null,
  applies_to_all_travelers: true,
  timing_mode: "exact",
  event_status: "planned",
  created_at: "2026-09-01T00:00:00.000Z"
};

const travelers: Traveler[] = [
  { id: "traveler-1", trip_id: trip.id, display_name: "Shantanu", is_minor: false, created_at: "2026-09-01T00:00:00.000Z" },
  { id: "traveler-2", trip_id: trip.id, display_name: "Shubham", is_minor: false, created_at: "2026-09-01T00:00:00.000Z" }
];

const expense: TripCost = {
  id: "cost-1",
  trip_id: trip.id,
  booking_id: null,
  itinerary_item_id: itineraryItem.id,
  title: "Museum tickets",
  category: "activity",
  amount_minor: 12_000_00,
  currency_code: "INR",
  payment_status: "paid",
  paid_by_traveler_id: travelers[0].id,
  participants: [
    { traveler_id: travelers[0].id, share_amount_minor: 6_000_00 },
    { traveler_id: travelers[1].id, share_amount_minor: 6_000_00 }
  ],
  notes: "Booked at the museum website",
  created_at: "2026-09-01T00:00:00.000Z"
};

describe("home trip expenses", () => {
  it("opens the itemized modal, reveals balances on request, and returns from an expense detail", async () => {
    mocks.listTrips.mockResolvedValue([trip]);
    mocks.listCosts.mockResolvedValue([expense]);
    mocks.listItinerary.mockResolvedValue([itineraryItem]);
    mocks.listTravelers.mockResolvedValue(travelers);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(<QueryClientProvider client={queryClient}><MemoryRouter><HomePage /></MemoryRouter></QueryClientProvider>);

    const featuredCardTarget = await screen.findByRole("link", { name: "Open October escape" });
    const explicitOpen = screen.getByRole("link", { name: /^Open trip$/ });
    expect(screen.getByText("Sep 26, 2026 - Oct 12, 2026")).toBeInTheDocument();
    expect(featuredCardTarget).toHaveAttribute("href", "/trips/trip-1");
    expect(explicitOpen).toHaveAttribute("href", "/trips/trip-1");
    expect(featuredCardTarget.contains(explicitOpen)).toBe(false);

    const readinessTarget = screen.getByRole("link", { name: "Open trip readiness" });
    const readinessCard = readinessTarget.closest(".surface-card");
    expect(readinessTarget).toHaveAttribute("href", "/trips/trip-1/readiness");
    expect(within(readinessCard as HTMLElement).getByRole("link", { name: /Continue setup/ })).toHaveAttribute("href", "/trips/trip-1/readiness");
    expect(readinessCard?.querySelector("a a, a button, button a, button button")).toBeNull();

    const openExpenses = await screen.findByRole("button", { name: "Open trip expenses" });
    const card = openExpenses.closest(".surface-card");
    expect(card?.querySelector("button a, a button")).toBeNull();
    expect(within(card as HTMLElement).getByRole("link", { name: "Add cost" })).toHaveAttribute("href", "/trips/trip-1?add=cost");

    await userEvent.click(openExpenses);

    const summary = screen.getByRole("dialog", { name: "Trip expenses" });
    expect(within(summary).getByRole("button", { name: "View details for Museum tickets" })).toHaveTextContent("2 travelers");
    expect(within(summary).queryByText("Balances by currency")).not.toBeInTheDocument();

    await userEvent.click(within(summary).getByRole("checkbox", { name: "Show balances" }));
    expect(within(summary).getByText("Balances by currency")).toBeInTheDocument();
    expect(within(summary).getByText(/gets.*6,000/)).toBeInTheDocument();
    expect(within(summary).getByText(/owes.*6,000/)).toBeInTheDocument();

    await userEvent.click(within(summary).getByRole("button", { name: "View details for Museum tickets" }));

    const details = screen.getByRole("dialog", { name: "Museum tickets" });
    expect(within(details).getByText("Booked at the museum website")).toBeInTheDocument();
    expect(within(details).queryByRole("button", { name: "Edit expense" })).not.toBeInTheDocument();

    await userEvent.click(within(details).getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog", { name: "Museum tickets" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Trip expenses" })).toBeInTheDocument();
  });
});
