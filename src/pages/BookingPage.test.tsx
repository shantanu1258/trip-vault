import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatEventTime } from "../features/trips/presentation";
import type { Trip } from "../features/trips/types";
import type { Booking, JourneyLeg } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getTrip: vi.fn(),
  listJourneyLegsForBooking: vi.fn()
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../features/trips/api", () => ({ getTrip: mocks.getTrip }));
vi.mock("../features/sync/localSync", () => ({ localProfileId: vi.fn().mockResolvedValue("user-1") }));
vi.mock("../features/workspace/travelerFocus", () => ({ readTravelerFocus: () => null }));
vi.mock("../features/workspace/WorkspaceForms", () => ({ EditBookingForm: () => null, UploadDocumentForm: () => null }));
vi.mock("../features/workspace/api", () => ({
  archiveBooking: vi.fn(),
  getBooking: mocks.getBooking,
  googleMapsDirectionsUrl: vi.fn(() => "https://maps.example/directions"),
  googleMapsSearchUrl: vi.fn(() => "https://maps.example/search"),
  listBookingTravelerIds: vi.fn().mockResolvedValue([]),
  listJourneyLegsForBooking: mocks.listJourneyLegsForBooking,
  listMembers: vi.fn().mockResolvedValue([]),
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
