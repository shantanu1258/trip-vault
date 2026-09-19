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
  listFlightLegsForBooking: vi.fn(),
  listTripAirlines: vi.fn(),
  listVaultDocuments: vi.fn()
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../components/ModalSheet", () => ({
  ModalSheet: ({ children, title }: { children: ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  )
}));
vi.mock("../components/SafeExternalAction", () => ({
  SafeExternalAction: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../features/sync/localSync", () => ({
  localProfileId: vi.fn().mockResolvedValue("user-1")
}));
vi.mock("../features/trips/api", () => ({
  getTrip: mocks.getTrip,
  listCosts: vi.fn().mockResolvedValue([]),
  listItinerary: vi.fn().mockResolvedValue([]),
  archiveTripCost: vi.fn()
}));
vi.mock("../features/workspace/travelerFocus", () => ({ readTravelerFocus: () => null }));
vi.mock("../features/workspace/AddFlightConnectionForm", () => ({
  AddFlightConnectionForm: () => null
}));
vi.mock("../features/workspace/FlightTravelerDetails", () => ({
  FlightTravelerDetails: () => null
}));
vi.mock("../features/workspace/WorkspaceForms", () => ({ UploadDocumentForm: () => null }));
vi.mock("../features/workspace/api", () => ({
  getBooking: mocks.getBooking,
  getFlightLeg: mocks.getFlightLeg,
  googleMapsDirectionsUrl: vi.fn(() => "https://maps.example/directions"),
  listBookingTravelerIds: vi.fn().mockResolvedValue([]),
  listFlightLegsForBooking: mocks.listFlightLegsForBooking,
  listFlightTravelers: vi.fn().mockResolvedValue([]),
  listMembers: mocks.listMembers,
  listTravelers: vi.fn().mockResolvedValue([]),
  listTripAirlines: mocks.listTripAirlines,
  listVaultDocuments: mocks.listVaultDocuments,
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
    marketing_airline_id: "airline-1",
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

async function renderFlight(
  scope: JourneyScope,
  initialEntry: string | { pathname: string; state: unknown } = "/trips/trip-1/flights/flight-1",
  connectedFlights?: FlightLeg[]
) {
  const currentFlight = flight(scope);
  mocks.getBooking.mockResolvedValue(booking(scope));
  mocks.getFlightLeg.mockResolvedValue(currentFlight);
  mocks.getTrip.mockResolvedValue(trip);
  mocks.listMembers.mockResolvedValue([
    {
      user_id: "user-1",
      role: "owner",
      participation_type: "traveler",
      joined_at: null,
      display_name: "Owner"
    }
  ]);
  mocks.listFlightLegsForBooking.mockResolvedValue(connectedFlights ?? [currentFlight]);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/trips/:tripId/flights/:flightLegId" element={<FlightPage />} />
          <Route path="/trips/:tripId" element={<section aria-label="Origin trip" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );

  const user = userEvent.setup();
  await screen.findByRole("button", { name: "Edit flight" });
  return { container: view.container, user };
}

async function renderEditor(scope: JourneyScope) {
  const { container, user } = await renderFlight(scope);
  await user.click(await screen.findByRole("button", { name: "Edit flight" }));
  await screen.findByRole("region", { name: "Manual flight update" });
  return container;
}

describe("flight edit time-zone controls", () => {
  it("offers summary navigation when a flight booking has a saved location", async () => {
    mocks.getBooking.mockResolvedValueOnce({
      ...booking("domestic"),
      location: { label: "Airport entrance" }
    });
    await renderFlight("domestic");
    expect(
      await screen.findByRole("link", { name: "Navigate to booking location" })
    ).toHaveAttribute("href", "https://maps.example/directions");
    const navigation = screen.getByRole("link", { name: "Navigate to booking location" });
    expect(navigation.querySelector("span")).toHaveClass("hidden", "md:inline");
    expect(navigation).toHaveAttribute("title", "Navigate to booking location");
    expect(navigation).toHaveClass("hero-shortcut");
  });

  it("does not offer navigation without a saved flight booking location", async () => {
    await renderFlight("domestic");
    expect(
      screen.queryByRole("link", { name: "Navigate to booking location" })
    ).not.toBeInTheDocument();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listVaultDocuments.mockResolvedValue([]);
    mocks.listTripAirlines.mockResolvedValue([
      {
        id: "airline-1",
        trip_id: trip.id,
        name: "Air India",
        iata_code: "AI",
        icao_code: "AIC",
        check_in_url_template: null,
        manage_booking_url_template: null,
        status_url_template: null,
        tracker_url_template: null,
        brand_color: "#d71920",
        metadata_source: "catalog",
        source_catalog_key: "air-india",
        source_config_version: 1,
        version: 1
      },
      {
        id: "airline-2",
        trip_id: trip.id,
        name: "Akasa Air",
        iata_code: "QP",
        icao_code: "AKJ",
        check_in_url_template: null,
        manage_booking_url_template: null,
        status_url_template: null,
        tracker_url_template: null,
        brand_color: "#7c3aed",
        metadata_source: "catalog",
        source_catalog_key: "akasa-air",
        source_config_version: 1,
        version: 1
      }
    ]);
  });

  it("uses the configured airline accent without replacing the flight treatment", async () => {
    await renderFlight("domestic");

    const hero = screen.getByRole("heading", { name: "BLR → DEL" }).closest("section");
    expect(hero?.style.getPropertyValue("--airline-accent")).toBe("#d71920");
    expect(hero).toHaveClass("airline-accent-hero", "bg-brand");
    const edit = screen.getByRole("button", { name: "Edit flight" });
    expect(hero?.contains(edit)).toBe(false);
    expect(edit.compareDocumentPosition(hero!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(edit).toHaveClass("text-brand", "hover:bg-brand-soft");
    expect(screen.queryByRole("button", { name: "Update flight" })).not.toBeInTheDocument();
  });

  it("visually and semantically identifies the selected leg and updates its schedule on navigation", async () => {
    const first = flight("domestic");
    const second: FlightLeg = {
      ...flight("domestic"),
      id: "flight-2",
      segment_order: 1,
      airline_name: "Akasa Air",
      marketing_airline_id: "airline-2",
      flight_number: "QP 202",
      departure_airport_code: "DEL",
      departure_airport_name: "Delhi",
      arrival_airport_code: "MEL",
      arrival_airport_name: "Melbourne"
    };

    const { user } = await renderFlight(
      "domestic",
      {
        pathname: "/trips/trip-1/flights/flight-1",
        state: tripChildNavigationState(null, "trip-1", "timeline", "/trips/trip-1?event=event-1")
      },
      [first, second]
    );

    const connection = await screen.findByRole("link", { name: /DEL → MEL.*QP 202.*View flight/i });
    const current = screen.getByRole("link", { name: /BLR → DEL.*Selected flight/i });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("bg-surface", "text-ink");
    expect(current).toHaveClass("after:bg-brand");
    expect(screen.queryByText(/Viewing now|Earlier leg|Next leg/)).not.toBeInTheDocument();
    expect(connection).not.toHaveAttribute("aria-current");
    expect(connection).toHaveClass("text-surface/80");
    expect(connection).not.toHaveClass("bg-surface");
    expect(connection).not.toHaveClass("airline-accent-rail");
    expect(connection.style.getPropertyValue("--airline-accent")).toBe("#7c3aed");
    expect(connection.querySelector(".airline-accent-dot")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Connection 1 · BLR → DEL" })).toBeInTheDocument();
    mocks.getFlightLeg.mockResolvedValue(second);
    await user.click(connection);
    expect(
      await screen.findByRole("heading", { name: "Connection 2 · DEL → MEL" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Akasa Air.*Selected flight/i })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: /Air India.*View flight/i })).not.toHaveAttribute(
      "aria-current"
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("region", { name: "Origin trip" })).toBeInTheDocument();
  });

  it("keeps domestic conversion metadata hidden and deterministic", async () => {
    const container = await renderEditor("domestic");

    expect(screen.queryByText(/if this clock time occurs twice/i)).not.toBeInTheDocument();
    expect(container.querySelector('select[name="scheduledDepartureOccurrence"]')).toBeNull();
    const occurrence = container.querySelector<HTMLInputElement>(
      'input[name="scheduledDepartureOccurrence"]'
    );
    expect(occurrence).toHaveAttribute("type", "hidden");
    expect(occurrence).toHaveValue("earlier");
    expect(screen.getByRole("button", { name: "Journey time zone" })).toHaveTextContent("Kolkata");
  });

  it("keeps repeated-clock choices visible for international flights", async () => {
    const container = await renderEditor("international");

    expect(screen.getAllByText(/if this clock time occurs twice/i)).toHaveLength(7);
    const occurrence = container.querySelector<HTMLSelectElement>(
      'select[name="scheduledDepartureOccurrence"]'
    );
    expect(occurrence).toHaveValue("automatic");
    expect(screen.queryByRole("button", { name: "Journey time zone" })).not.toBeInTheDocument();
  });

  it("opens the editor from the whole departure information card", async () => {
    const { user } = await renderFlight("domestic");

    await user.click(screen.getByRole("button", { name: /Departure.*Bengaluru/i }));

    expect(await screen.findByRole("region", { name: "Manual flight update" })).toBeInTheDocument();
    await waitFor(() =>
      expect(document.querySelector('[name="scheduledDeparture"]')).toHaveFocus()
    );
  });

  it("returns to the source Trip details tab", async () => {
    await renderFlight("domestic", {
      pathname: "/trips/trip-1/flights/flight-1",
      state: tripChildNavigationState(null, "trip-1", "details")
    });

    expect(screen.getByRole("link", { name: "Back to trip" })).toHaveAttribute(
      "href",
      "/trips/trip-1?view=details"
    );
  });

  it("contains long generated document titles inside the mobile flight card", async () => {
    const longTitle =
      "Other booking confirmation · Ankita · Some Place to Some Place with a deliberately long generated title";
    mocks.listVaultDocuments.mockResolvedValue([
      {
        id: "primary",
        trip_id: trip.id,
        booking_id: "booking-1",
        flight_leg_id: "flight-1",
        traveler_id: null,
        assignment_mode: "shared",
        traveler_ids: [],
        title: "Boarding pass",
        category: "flight",
        purpose: "boarding_pass",
        short_label: null,
        visibility: "trip",
        current_version_id: null,
        updated_at: "2026-09-01T00:00:00.000Z"
      },
      {
        id: "long",
        trip_id: trip.id,
        booking_id: "booking-1",
        flight_leg_id: "flight-1",
        traveler_id: null,
        assignment_mode: "shared",
        traveler_ids: [],
        title: longTitle,
        category: "flight",
        purpose: "confirmation",
        short_label: null,
        visibility: "trip",
        current_version_id: null,
        updated_at: "2026-09-01T00:00:00.000Z"
      }
    ]);

    await renderFlight("domestic");

    const card = screen.getByRole("link", { name: new RegExp(longTitle) });
    const shortcut = screen.getByRole("link", { name: "Open boarding pass" });
    expect(shortcut.querySelector("span")).toHaveClass("hidden", "md:inline");
    expect(shortcut).toHaveAttribute("title", "Open boarding pass");
    expect(shortcut).toHaveAttribute("href", "/trips/trip-1/documents/primary");
    expect(shortcut).toHaveClass("hero-shortcut");
    expect(card).toHaveClass("min-w-0", "max-w-full", "overflow-hidden");
    expect(screen.getByText(longTitle)).toHaveClass(
      "whitespace-normal",
      "break-words",
      "[overflow-wrap:anywhere]"
    );
    expect(screen.getByText(longTitle)).not.toHaveClass("truncate");
  });
});
