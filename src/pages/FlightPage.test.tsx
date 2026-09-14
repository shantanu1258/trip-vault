import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../features/trips/types";
import { tripChildNavigationState } from "../features/trips/navigation";
import type { Booking, FlightLeg, JourneyScope } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getFlightLeg: vi.fn(),
  getTrip: vi.fn(),
  listMembers: vi.fn(),
  listFlightLegsForBooking: vi.fn()
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../components/SafeExternalAction", () => ({ SafeExternalAction: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../features/sync/localSync", () => ({ localProfileId: vi.fn().mockResolvedValue("user-1") }));
vi.mock("../features/trips/api", () => ({ getTrip: mocks.getTrip }));
vi.mock("../features/workspace/travelerFocus", () => ({ readTravelerFocus: () => null }));
vi.mock("../features/workspace/AddFlightConnectionForm", () => ({ AddFlightConnectionForm: () => null }));
vi.mock("../features/workspace/FlightTravelerDetails", () => ({ FlightTravelerDetails: () => null }));
vi.mock("../features/workspace/WorkspaceForms", () => ({ UploadDocumentForm: () => null }));
vi.mock("../features/workspace/api", () => ({
  getBooking: mocks.getBooking,
  getFlightLeg: mocks.getFlightLeg,
  listBookingTravelerIds: vi.fn().mockResolvedValue([]),
  listFlightLegsForBooking: mocks.listFlightLegsForBooking,
  listFlightTravelers: vi.fn().mockResolvedValue([]),
  listMembers: mocks.listMembers,
  listTravelers: vi.fn().mockResolvedValue([]),
  listTripAirlines: vi.fn().mockResolvedValue([]),
  listVaultDocuments: vi.fn().mockResolvedValue([]),
  updateFlightLeg: vi.fn()
}));

import { FlightPage } from "./FlightPage";

const trip: Trip = {
  id: "trip-1",
  title: "Delhi visit",
  destination_summary: "Delhi",
  start_date: "2026-09-28",
  end_date: "2026-09-30",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

function booking(scope: JourneyScope): Booking {
  return {
    id: "booking-1",
    trip_id: trip.id,
    type: "flight",
    title: "Flight to Delhi",
    provider: "Air India",
    reference_code: "ABC123",
    start_at: "2026-09-28T03:30:00.000Z",
    end_at: "2026-09-28T06:00:00.000Z",
    source_timezone: "Asia/Kolkata",
    location: null,
    details: {},
    journey_scope: scope,
    created_at: "2026-09-01T00:00:00.000Z"
  };
}

function flight(scope: JourneyScope): FlightLeg {
  return {
    id: "flight-1",
    booking_id: "booking-1",
    segment_order: 0,
    airline_name: "Air India",
    flight_number: "AI 101",
    departure_airport_code: "BLR",
    departure_airport_name: "Bengaluru",
    arrival_airport_code: scope === "domestic" ? "DEL" : "DXB",
    arrival_airport_name: scope === "domestic" ? "Delhi" : "Dubai",
    scheduled_departure_at: "2026-09-28T03:30:00.000Z",
    scheduled_arrival_at: "2026-09-28T06:00:00.000Z",
    estimated_departure_at: null,
    estimated_arrival_at: null,
    actual_departure_at: null,
    actual_arrival_at: null,
    departure_timezone: "Asia/Kolkata",
    arrival_timezone: scope === "domestic" ? "Asia/Kolkata" : "Asia/Dubai",
    boarding_at: null,
    boarding_lead_minutes: 45,
    journey_scope: scope,
    departure_country_code: "IN",
    arrival_country_code: scope === "domestic" ? "IN" : "AE",
    departure_terminal: null,
    departure_gate: null,
    arrival_terminal: null,
    arrival_gate: null,
    baggage_claim: null,
    status: "scheduled",
    status_note: null,
    status_updated_by: "user-1",
    status_updated_at: "2026-09-01T00:00:00.000Z",
    version: 1
  };
}

async function renderFlight(scope: JourneyScope, initialEntry: string | { pathname: string; state: unknown } = "/trips/trip-1/flights/flight-1") {
  const currentFlight = flight(scope);
  mocks.getBooking.mockResolvedValue(booking(scope));
  mocks.getFlightLeg.mockResolvedValue(currentFlight);
  mocks.getTrip.mockResolvedValue(trip);
  mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner", participation_type: "traveler", joined_at: null, display_name: "Owner" }]);
  mocks.listFlightLegsForBooking.mockResolvedValue([currentFlight]);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/trips/:tripId/flights/:flightLegId" element={<FlightPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Update flight" });
  return { container: view.container, user };
}

async function renderEditor(scope: JourneyScope) {
  const { container, user } = await renderFlight(scope);
  await user.click(await screen.findByRole("button", { name: "Update flight" }));
  await screen.findByRole("region", { name: "Manual flight update" });
  return container;
}

describe("flight edit time-zone controls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps domestic conversion metadata hidden and deterministic", async () => {
    const container = await renderEditor("domestic");

    expect(screen.queryByText(/if this clock time occurs twice/i)).not.toBeInTheDocument();
    expect(container.querySelector('select[name="scheduledDepartureOccurrence"]')).toBeNull();
    const occurrence = container.querySelector<HTMLInputElement>('input[name="scheduledDepartureOccurrence"]');
    expect(occurrence).toHaveAttribute("type", "hidden");
    expect(occurrence).toHaveValue("earlier");
  });

  it("keeps repeated-clock choices visible for international flights", async () => {
    const container = await renderEditor("international");

    expect(screen.getAllByText(/if this clock time occurs twice/i)).toHaveLength(7);
    const occurrence = container.querySelector<HTMLSelectElement>('select[name="scheduledDepartureOccurrence"]');
    expect(occurrence).toHaveValue("automatic");
  });

  it("opens the editor from the whole departure information card", async () => {
    const { user } = await renderFlight("domestic");

    await user.click(screen.getByRole("button", { name: /Departure.*Bengaluru/i }));

    expect(await screen.findByRole("region", { name: "Manual flight update" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[name="scheduledDeparture"]')).toHaveFocus());
  });

  it("returns to the source Trip details tab", async () => {
    await renderFlight("domestic", {
      pathname: "/trips/trip-1/flights/flight-1",
      state: tripChildNavigationState(null, "trip-1", "details")
    });

    expect(screen.getByRole("link", { name: "Back to trip" })).toHaveAttribute("href", "/trips/trip-1?view=details");
  });
});
