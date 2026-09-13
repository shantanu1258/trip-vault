import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatEventTime } from "../features/trips/presentation";
import type { Trip } from "../features/trips/types";
import type { Booking, JourneyLeg } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getTrip: vi.fn(),
  listJourneyLegsForBooking: vi.fn(),
  listMembers: vi.fn().mockResolvedValue([])
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../features/trips/api", () => ({ getTrip: mocks.getTrip }));
vi.mock("../features/sync/localSync", () => ({ localProfileId: vi.fn().mockResolvedValue("user-1") }));
vi.mock("../features/workspace/travelerFocus", () => ({ readTravelerFocus: () => null }));
vi.mock("../features/workspace/WorkspaceForms", () => ({ EditBookingForm: () => <section aria-label="Edit booking form" />, UploadDocumentForm: () => null }));
vi.mock("../features/workspace/api", () => ({
  archiveBooking: vi.fn(),
  getBooking: mocks.getBooking,
  googleMapsDirectionsUrl: vi.fn(() => "https://maps.example/directions"),
  googleMapsSearchUrl: vi.fn(() => "https://maps.example/search"),
  listBookingTravelerIds: vi.fn().mockResolvedValue([]),
  listJourneyLegsForBooking: mocks.listJourneyLegsForBooking,
  listMembers: mocks.listMembers,
  listTravelers: vi.fn().mockResolvedValue([]),
  listVaultDocuments: vi.fn().mockResolvedValue([])
}));

import { BookingPage } from "./BookingPage";

const trip: Trip = {
  id: "trip-1",
  title: "Dubai journey",
  destination_summary: "Dubai",
  start_date: "2026-09-28",
  end_date: "2026-09-30",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const booking: Booking = {
  id: "booking-1",
  trip_id: trip.id,
  type: "bus",
  title: "Bus to Dubai",
  provider: "Example coach",
  reference_code: "BUS123",
  start_at: "2026-09-28T03:30:00.000Z",
  end_at: "2026-09-28T12:00:00.000Z",
  source_timezone: "Asia/Kolkata",
  location: null,
  details: {},
  journey_scope: "international",
  created_at: "2026-09-01T00:00:00.000Z"
};

const leg: JourneyLeg = {
  id: "leg-1",
  booking_id: booking.id,
  segment_order: 0,
  mode: "bus",
  operator_name: "Example coach",
  service_number: "E1",
  origin_code: "DEL",
  origin_name: "Delhi",
  origin_country_code: "IN",
  origin_timezone: "Asia/Kolkata",
  destination_code: "DXB",
  destination_name: "Dubai",
  destination_country_code: "AE",
  destination_timezone: "Asia/Dubai",
  scheduled_departure_at: booking.start_at!,
  scheduled_arrival_at: booking.end_at!,
  boarding_at: null,
  boarding_lead_minutes: null,
  departure_platform: null,
  arrival_platform: null,
  coach_or_cabin: null,
  seat: null,
  status_note: null
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/trips/trip-1/bookings/booking-1"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/trips/:tripId/bookings/:bookingId" element={<BookingPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.listMembers.mockResolvedValue([]);
});

describe("generic journey booking times", () => {
  beforeEach(() => {
    mocks.getBooking.mockResolvedValue(booking);
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listJourneyLegsForBooking.mockResolvedValue([leg]);
  });

  it("formats the booking end in the final destination time zone", async () => {
    renderPage();

    const expected = formatEventTime(booking.end_at!, leg.destination_timezone);
    const departureZoneValue = formatEventTime(booking.end_at!, booking.source_timezone!);
    await waitFor(() => {
      const endsCard = screen.getByText("Ends").closest("div");
      expect(endsCard).not.toBeNull();
      expect(within(endsCard!).getByText(expected)).toBeInTheDocument();
      expect(within(endsCard!).queryByText(departureZoneValue)).not.toBeInTheDocument();
    });
  });
});

describe("booking detail card interactions", () => {
  const interactiveBooking: Booking = {
    ...booking,
    booked_via_name: "Travel vendor",
    booked_via_url: "https://booking.example/reservation",
    contact_name: "Support desk",
    contact_phone: "+919876543210",
    location: { label: "Central bus terminal", address: "Terminal Road, Delhi" },
    details: { notes: "Arrive at bay 4 thirty minutes early." }
  };

  beforeEach(() => {
    mocks.getBooking.mockResolvedValue(interactiveBooking);
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listJourneyLegsForBooking.mockResolvedValue([leg]);
    mocks.listMembers.mockResolvedValue([
      { user_id: "user-1", role: "editor", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }
    ]);
  });

  it("opens the booking editor from shallow fact and journey cards", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole("button", { name: "Edit Starts" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Booking reference / PNR" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit booking source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit booking contact" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit journey leg 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Location" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit booking notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Bus to Dubai" })).toHaveTextContent("Edit booking");
    expect(document.querySelector("button button, button a, a button, a a")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit Starts" }));

    expect(screen.getByRole("region", { name: "Edit booking form" })).toBeInTheDocument();
  });

  it("keeps copy, booking-site, phone, and map actions independent from editing", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("button", { name: "Edit booking contact" });
    const independentActions = [
      screen.getByRole("button", { name: "Copy Booking reference / PNR" }),
      screen.getByRole("link", { name: "Travel vendor →" }),
      screen.getByRole("link", { name: "Call" }),
      screen.getByRole("link", { name: "WhatsApp" }),
      screen.getByRole("link", { name: "Open in Maps" }),
      screen.getByRole("link", { name: "Directions" }),
      screen.getByRole("button", { name: "Copy address" })
    ];

    for (const action of independentActions) {
      if (action instanceof HTMLAnchorElement) action.addEventListener("click", (event) => event.preventDefault(), { once: true });
      await user.click(action);
      expect(screen.queryByRole("region", { name: "Edit booking form" })).not.toBeInTheDocument();
    }
  });

  it("renders the same cards as static details for a viewer", async () => {
    mocks.listMembers.mockResolvedValue([
      { user_id: "user-1", role: "viewer", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }
    ]);
    renderPage();

    await screen.findByText("Booking reference / PNR");
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy Booking reference / PNR" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in Maps" })).toBeInTheDocument();
  });
});
