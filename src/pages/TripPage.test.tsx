import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ItineraryItem } from "../features/trips/types";
import type { Booking, FlightLeg, Traveler } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({ listFlightTravelers: vi.fn() }));

vi.mock("../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../features/workspace/EventDocuments", () => ({ EventDocuments: () => null }));
vi.mock("../features/workspace/api", async () => {
  const actual = await vi.importActual<typeof import("../features/workspace/api")>("../features/workspace/api");
  return { ...actual, listFlightTravelers: mocks.listFlightTravelers };
});

import { EventDetailsSheet } from "./TripPage";

const activity: ItineraryItem = {
  id: "activity-1",
  trip_id: "trip-1",
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

function renderDetails({ item = activity, booking, flights = [], travelers = [], focusedTravelerId, onAddBooking = vi.fn(), onEdit = vi.fn() }: { item?: ItineraryItem; booking?: Booking; flights?: FlightLeg[]; travelers?: Traveler[]; focusedTravelerId?: string | null; onAddBooking?: () => void; onEdit?: () => void } = {}) {
  const noop = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><EventDetailsSheet item={item} tripId="trip-1" booking={booking} flights={flights} journeys={[]} travelerIds={[]} travelers={travelers} costs={[]} focusedTravelerId={focusedTravelerId} editable canMoveUp={false} canMoveDown={false} onClose={noop} onEdit={onEdit} onArchive={noop} onAddBooking={onAddBooking} onAddCost={noop} onEditCost={noop} onUploadDocument={noop} onStatus={noop} onMoveUp={noop} onMoveDown={noop} /></MemoryRouter></QueryClientProvider>);
  return { onAddBooking, onEdit };
}

describe("activity event details", () => {
  it("offers booking enrichment from an unbooked activity", async () => {
    const { onAddBooking } = renderDetails();
    await userEvent.click(screen.getByRole("button", { name: "Add booking details" }));
    expect(onAddBooking).toHaveBeenCalledOnce();
  });

  it("does not offer another booking while a linked booking is loading", () => {
    renderDetails({ item: { ...activity, booking_id: "booking-1" } });
    expect(screen.queryByRole("button", { name: "Add booking details" })).not.toBeInTheDocument();
  });

  it("directs a flexible activity to exact-time editing instead of creating a booking", async () => {
    const { onAddBooking, onEdit } = renderDetails({ item: { ...activity, timing_mode: "relative", anchor_itinerary_item_id: "event-1", relative_position: "after" } });

    expect(screen.getByText("Booking details need an exact time")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add booking details" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Set exact time" }));
    expect(onEdit).toHaveBeenCalledOnce();
    expect(onAddBooking).not.toHaveBeenCalled();
  });
});

describe("flight event details", () => {
  it("shows only the focused traveler's seat and boarding details as soon as the event opens", async () => {
    const booking: Booking = {
      id: "booking-1", trip_id: "trip-1", type: "flight", title: "Flight to Dubai", provider: "Air India", reference_code: "ABC123",
      start_at: "2026-09-28T04:00:00.000Z", end_at: "2026-09-28T08:00:00.000Z", source_timezone: "Asia/Kolkata", location: null,
      details: {}, journey_scope: "international", created_at: "2026-09-01T00:00:00.000Z"
    };
    const flight: FlightLeg = {
      id: "flight-1", booking_id: booking.id, segment_order: 0, airline_name: "Air India", flight_number: "AI 995",
      departure_airport_code: "DEL", departure_airport_name: "Indira Gandhi International Airport", arrival_airport_code: "DXB", arrival_airport_name: "Dubai International Airport",
      scheduled_departure_at: "2026-09-28T04:00:00.000Z", scheduled_arrival_at: "2026-09-28T08:00:00.000Z", estimated_departure_at: null, estimated_arrival_at: null,
      actual_departure_at: null, actual_arrival_at: null, departure_timezone: "Asia/Kolkata", arrival_timezone: "Asia/Dubai", boarding_at: null,
      departure_terminal: "3", departure_gate: "12", arrival_terminal: "1", arrival_gate: null, baggage_claim: null, status: "scheduled", status_note: null,
      status_updated_by: "user-1", status_updated_at: "2026-09-01T00:00:00.000Z"
    };
    const travelers: Traveler[] = [
      { id: "traveler-1", trip_id: "trip-1", display_name: "Shantanu", is_minor: false, created_at: "2026-09-01T00:00:00.000Z" },
      { id: "traveler-2", trip_id: "trip-1", display_name: "Rahul", is_minor: false, created_at: "2026-09-01T00:00:00.000Z" }
    ];
    mocks.listFlightTravelers.mockResolvedValue([
      { id: "flight-1:traveler-1", flight_leg_id: "flight-1", traveler_id: "traveler-1", seat: "12A", boarding_group: "2", ticket_number: null },
      { id: "flight-1:traveler-2", flight_leg_id: "flight-1", traveler_id: "traveler-2", seat: "14C", boarding_group: "3", ticket_number: "098765" }
    ]);

    renderDetails({ item: { ...activity, event_type: "flight", booking_id: booking.id }, booking, flights: [flight], travelers, focusedTravelerId: "traveler-2" });

    expect(await screen.findByText("Rahul · Seat 14C · Group 3 · Ticket 098765")).toBeInTheDocument();
    expect(screen.queryByText(/Seat 12A/)).not.toBeInTheDocument();
  });
});
