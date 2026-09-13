import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip, TripCost } from "../features/trips/types";
import { CostDetailsSheet, TripExpensesContent } from "../features/trips/TripExpenses";
import type { Booking, FlightLeg, Traveler, TripNote } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  listArchivedTripItems: vi.fn().mockResolvedValue([]),
  listBookings: vi.fn().mockResolvedValue([]),
  listCosts: vi.fn().mockResolvedValue([]),
  listFlightLegsForTrip: vi.fn().mockResolvedValue([]),
  listFlightTravelers: vi.fn(),
  listItinerary: vi.fn().mockResolvedValue([]),
  listJourneyLegsForTrip: vi.fn().mockResolvedValue([]),
  listMembers: vi.fn().mockResolvedValue([]),
  listNotes: vi.fn().mockResolvedValue([]),
  listRequirements: vi.fn().mockResolvedValue([]),
  listTravelers: vi.fn().mockResolvedValue([]),
  listTripBookingTravelers: vi.fn().mockResolvedValue([]),
  listTripItineraryParticipants: vi.fn().mockResolvedValue([]),
  listTripRequirementAssignees: vi.fn().mockResolvedValue([]),
  listVaultDocuments: vi.fn().mockResolvedValue([])
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../components/ModalSheet", () => ({ ModalSheet: ({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) => <section aria-label={title}><button type="button" onClick={onClose}>Back</button>{children}</section> }));
vi.mock("../features/readiness/OfflinePackControl", () => ({ OfflinePackControl: () => null }));
vi.mock("../features/sync/localSync", () => ({ localProfileId: vi.fn().mockResolvedValue("owner-user") }));
vi.mock("../features/trips/api", async () => {
  const actual = await vi.importActual<typeof import("../features/trips/api")>("../features/trips/api");
  return {
    ...actual,
    getTrip: mocks.getTrip,
    listArchivedTripItems: mocks.listArchivedTripItems,
    listCosts: mocks.listCosts,
    listItinerary: mocks.listItinerary
  };
});
vi.mock("../features/workspace/EventDocuments", () => ({ EventDocuments: () => null }));
vi.mock("../features/workspace/TripAirlinesPanel", () => ({ TripAirlinesPanel: () => null }));
vi.mock("../features/workspace/api", async () => {
  const actual = await vi.importActual<typeof import("../features/workspace/api")>("../features/workspace/api");
  return {
    ...actual,
    listBookings: mocks.listBookings,
    listFlightLegsForTrip: mocks.listFlightLegsForTrip,
    listFlightTravelers: mocks.listFlightTravelers,
    listJourneyLegsForTrip: mocks.listJourneyLegsForTrip,
    listMembers: mocks.listMembers,
    listNotes: mocks.listNotes,
    listRequirements: mocks.listRequirements,
    listTravelers: mocks.listTravelers,
    listTripBookingTravelers: mocks.listTripBookingTravelers,
    listTripItineraryParticipants: mocks.listTripItineraryParticipants,
    listTripRequirementAssignees: mocks.listTripRequirementAssignees,
    listVaultDocuments: mocks.listVaultDocuments
  };
});

import { EventDetailsSheet, indexFirstFlightByBooking, NoteCard, ReservationCard, TripPage } from "./TripPage";

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

const expenseTravelers: Traveler[] = [
  { id: "traveler-1", trip_id: "trip-1", display_name: "Shantanu", is_minor: false, created_at: "2026-09-01T00:00:00.000Z" },
  { id: "traveler-2", trip_id: "trip-1", display_name: "Shubham", is_minor: false, created_at: "2026-09-01T00:00:00.000Z" }
];

const expense: TripCost = {
  id: "cost-1",
  trip_id: "trip-1",
  booking_id: null,
  itinerary_item_id: activity.id,
  title: "Museum tickets",
  category: "activity",
  amount_minor: 12_000_00,
  currency_code: "INR",
  payment_status: "paid",
  paid_by_traveler_id: "traveler-1",
  participants: [
    { traveler_id: "traveler-1", share_amount_minor: 6_000_00 },
    { traveler_id: "traveler-2", share_amount_minor: 6_000_00 }
  ],
  notes: "Booked at the museum website",
  created_at: "2026-09-01T00:00:00.000Z"
};

const ownerTrip: Trip = {
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

function renderDetails({ item = activity, itinerary = [], booking, flights = [], travelers = [], costs = [], focusedTravelerId, editable = true, onAddBooking = vi.fn(), onEdit = vi.fn(), onViewCost = vi.fn() }: { item?: ItineraryItem; itinerary?: ItineraryItem[]; booking?: Booking; flights?: FlightLeg[]; travelers?: Traveler[]; costs?: TripCost[]; focusedTravelerId?: string | null; editable?: boolean; onAddBooking?: () => void; onEdit?: () => void; onViewCost?: (cost: TripCost) => void } = {}) {
  const noop = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><EventDetailsSheet item={item} itinerary={itinerary} tripId="trip-1" booking={booking} flights={flights} journeys={[]} travelerIds={[]} travelers={travelers} costs={costs} focusedTravelerId={focusedTravelerId} editable={editable} canMoveUp={false} canMoveDown={false} onClose={noop} onEdit={onEdit} onArchive={noop} onAddBooking={onAddBooking} onAddCost={noop} onViewCost={onViewCost} onUploadDocument={noop} onStatus={noop} onMoveUp={noop} onMoveDown={noop} /></MemoryRouter></QueryClientProvider>);
  return { onAddBooking, onEdit, onViewCost };
}

describe("trip overview card", () => {
  it("lets the owner open Trip settings from the card body without nesting interactive controls", async () => {
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listMembers.mockResolvedValue([
      { user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/trips/trip-1?view=details"]}>
          <Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const overviewHeading = await screen.findByRole("heading", { name: "Trip information" });
    const overview = overviewHeading.closest("section");
    expect(overview).not.toBeNull();
    if (!overview) throw new Error("Trip information card was not rendered");
    const cardBody = within(overview).getByRole("button", { name: "Edit Trip information" });
    const editAction = within(overview).getByRole("button", { name: "Edit" });
    expect(cardBody.contains(editAction)).toBe(false);
    expect(overview.querySelector("button button, button a, a button, a a")).toBeNull();

    await userEvent.click(cardBody);

    expect(screen.getByRole("region", { name: "Trip settings" })).toBeInTheDocument();
  });
});

describe("trip expense summary", () => {
  it("opens from the trip total and returns to the summary after viewing an expense", async () => {
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listCosts.mockResolvedValue([expense]);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([
      { user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/trips/trip-1"]}>
          <Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Open trip expenses" }));

    const summary = screen.getByRole("region", { name: "Trip expenses" });
    await userEvent.click(within(summary).getByRole("button", { name: "View details for Museum tickets" }));
    const details = screen.getByRole("region", { name: "Museum tickets" });
    expect(screen.queryByRole("region", { name: "Trip expenses" })).not.toBeInTheDocument();

    await userEvent.click(within(details).getByRole("button", { name: "Back" }));

    expect(screen.queryByRole("region", { name: "Museum tickets" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Trip expenses" })).toBeInTheDocument();
  });

  it("opens the same summary from the itemized expenses card", async () => {
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listCosts.mockResolvedValue([expense]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([
      { user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/trips/trip-1?view=details"]}>
          <Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await userEvent.click(await screen.findByRole("button", { name: "Open itemized trip expenses" }));

    expect(screen.getByRole("region", { name: "Trip expenses" })).toBeInTheDocument();
  });
});

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

  it("keeps the named order and duration visible while allowing a booking before the exact time is known", async () => {
    const anchor = { ...activity, id: "event-1", title: "Shantanu Hotel – Palm Springs" };
    const relative = { ...activity, timing_mode: "relative" as const, anchor_itinerary_item_id: anchor.id, relative_position: "after" as const, has_explicit_start_time: false, duration_minutes: 90 };
    const { onAddBooking } = renderDetails({ item: relative, itinerary: [anchor, relative] });

    expect(screen.getByText("After Shantanu Hotel – Palm Springs")).toBeInTheDocument();
    expect(screen.getByText("Planned duration · 1h 30m")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add booking details" }));
    expect(onAddBooking).toHaveBeenCalledOnce();
  });

  it("opens a linked expense's details for a viewer instead of jumping to edit", async () => {
    const onViewCost = vi.fn();
    renderDetails({ costs: [expense], travelers: expenseTravelers, editable: false, onViewCost });

    await userEvent.click(screen.getByRole("button", { name: "View details for Museum tickets" }));

    expect(onViewCost).toHaveBeenCalledWith(expense);
    expect(screen.queryByRole("button", { name: "Edit expense" })).not.toBeInTheDocument();
  });
});

describe("trip expense cards", () => {
  it("keeps balances hidden until requested and opens a cost from the whole row", async () => {
    const onViewCost = vi.fn();
    render(<TripExpensesContent costs={[expense]} balances={[{ travelerId: "traveler-1", currencyCode: "INR", amountMinor: 6_000_00 }]} travelers={expenseTravelers} onViewCost={onViewCost} />);

    expect(screen.queryByText("Balances by currency")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Show balances" }));
    expect(screen.getByText("Balances by currency")).toBeInTheDocument();
    expect(screen.getByText(/gets.*6,000/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "View details for Museum tickets" }));
    expect(onViewCost).toHaveBeenCalledWith(expense);
  });

  it("shows payment, linkage, shares and notes before offering edit", async () => {
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    render(<CostDetailsSheet cost={expense} travelers={expenseTravelers} itinerary={[activity]} editable onClose={vi.fn()} onEdit={onEdit} onArchive={onArchive} />);

    expect(screen.getByRole("region", { name: "Museum tickets" })).toBeInTheDocument();
    expect(screen.getByText("Paid by").nextSibling).toHaveTextContent("Shantanu");
    expect(screen.getByText("Connected to").nextSibling).toHaveTextContent("Museum visit");
    expect(screen.getAllByText(/6,000/)).toHaveLength(2);
    expect(screen.getByText("Booked at the museum website")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Edit expense" }));
    expect(onEdit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledOnce();
  });

  it("resolves equal null shares deterministically without losing a minor unit", () => {
    const equalSplitExpense: TripCost = {
      ...expense,
      id: "cost-equal-split",
      amount_minor: 10_001,
      participants: [
        { traveler_id: "traveler-2", share_amount_minor: null },
        { traveler_id: "traveler-1", share_amount_minor: null }
      ]
    };

    render(<CostDetailsSheet cost={equalSplitExpense} travelers={expenseTravelers} itinerary={[activity]} editable={false} onClose={vi.fn()} onEdit={vi.fn()} onArchive={vi.fn()} />);

    const participantRows = screen.getAllByRole("listitem");
    const shantanuRow = participantRows.find((row) => within(row).queryByText("Shantanu"));
    const shubhamRow = participantRows.find((row) => within(row).queryByText("Shubham"));
    expect(shantanuRow).toHaveTextContent(/50\.01/);
    expect(shubhamRow).toHaveTextContent(/50\.00/);
    expect(screen.queryByText("Equal share")).not.toBeInTheDocument();
  });

  it("excludes refunded expenses from the headline while keeping their detail row", async () => {
    const refundedExpense: TripCost = {
      ...expense,
      id: "cost-refunded",
      title: "Refunded museum audio guide",
      amount_minor: 2_000_00,
      payment_status: "refunded"
    };
    const onViewCost = vi.fn();
    renderDetails({ costs: [expense, refundedExpense], travelers: expenseTravelers, onViewCost });

    const headline = screen.getByText(/^Cost ·/);
    expect(headline).toHaveTextContent(/12,000/);
    expect(headline).not.toHaveTextContent(/14,000/);
    const refundedRow = screen.getByRole("button", { name: "View details for Refunded museum audio guide" });
    expect(refundedRow).toHaveTextContent("refunded");

    await userEvent.click(refundedRow);
    expect(onViewCost).toHaveBeenCalledWith(refundedExpense);
  });
});

describe("connecting flight booking index", () => {
  it("retains the first flight leg even when later legs arrive first", () => {
    const laterLeg: FlightLeg = {
      id: "flight-connection",
      booking_id: "booking-connected",
      segment_order: 1,
      airline_name: "Air India",
      flight_number: "AI 995",
      departure_airport_code: "DEL",
      departure_airport_name: "Indira Gandhi International Airport",
      arrival_airport_code: "DXB",
      arrival_airport_name: "Dubai International Airport",
      scheduled_departure_at: "2026-09-28T08:00:00.000Z",
      scheduled_arrival_at: "2026-09-28T12:00:00.000Z",
      estimated_departure_at: null,
      estimated_arrival_at: null,
      actual_departure_at: null,
      actual_arrival_at: null,
      departure_timezone: "Asia/Kolkata",
      arrival_timezone: "Asia/Dubai",
      boarding_at: null,
      departure_terminal: "3",
      departure_gate: null,
      arrival_terminal: "1",
      arrival_gate: null,
      baggage_claim: null,
      status: "scheduled",
      status_note: null,
      status_updated_by: "user-1",
      status_updated_at: "2026-09-01T00:00:00.000Z"
    };
    const firstLeg: FlightLeg = {
      ...laterLeg,
      id: "flight-origin",
      segment_order: 0,
      flight_number: "AI 803",
      departure_airport_code: "BLR",
      departure_airport_name: "Kempegowda International Airport",
      arrival_airport_code: "DEL",
      arrival_airport_name: "Indira Gandhi International Airport",
      scheduled_departure_at: "2026-09-28T03:00:00.000Z",
      scheduled_arrival_at: "2026-09-28T06:00:00.000Z"
    };

    const indexed = indexFirstFlightByBooking([laterLeg, firstLeg]);

    expect(indexed.get("booking-connected")).toBe(firstLeg);
  });
});

describe("reservation cards", () => {
  it("makes the complete card a details link while keeping phone actions independent", () => {
    const reservation: Booking = {
      id: "booking-1", trip_id: "trip-1", type: "hotel", title: "Palm Springs Hotel", provider: "Palm Springs", reference_code: "HOTEL123",
      start_at: null, end_at: null, source_timezone: null, location: null, details: {}, journey_scope: null, booked_via_name: "Booking.com", contact_phone: "+919876543210",
      created_at: "2026-09-01T00:00:00.000Z"
    };
    render(<MemoryRouter><ReservationCard booking={reservation} href="/trips/trip-1/bookings/booking-1" route="DXB" /></MemoryRouter>);

    expect(screen.getByRole("link", { name: "Open details for Palm Springs Hotel" })).toHaveAttribute("href", "/trips/trip-1/bookings/booking-1");
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+919876543210");
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", expect.stringContaining("wa.me"));
  });
});

describe("note cards", () => {
  it("opens edit from the card while archive remains an independent action", async () => {
    const note: TripNote = { id: "note-1", trip_id: "trip-1", title: "Door code", body: "Use 2486", created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z" };
    const onEdit = vi.fn();
    const onArchive = vi.fn();
    render(<NoteCard note={note} editable onEdit={onEdit} onArchive={onArchive} />);

    await userEvent.click(screen.getByRole("button", { name: "Edit Door code" }));
    expect(onEdit).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Archive Door code" }));
    expect(onArchive).toHaveBeenCalledOnce();
    expect(onEdit).toHaveBeenCalledOnce();
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

    expect(screen.getByRole("link", { name: "Open booking details for Flight to Dubai" })).toHaveAttribute("href", "/trips/trip-1/flights/flight-1");
    expect(await screen.findByText("Rahul · Seat 14C · Group 3 · Ticket 098765")).toBeInTheDocument();
    expect(screen.queryByText(/Seat 12A/)).not.toBeInTheDocument();
  });
});
