import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip } from "../trips/types";
import type { Booking, Traveler } from "./types";

const mocks = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  clearDraft: vi.fn(),
  listInvitations: vi.fn(),
  listAssociatedAccounts: vi.fn(),
  createTripMembershipOffer: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  listItinerary: vi.fn(),
  saveHotelStay: vi.fn(),
  updateBooking: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../../lib/forms/useFormDraft", () => ({ useFormDraft: () => ({ formRef: { current: null }, clearDraft: mocks.clearDraft }) }));
vi.mock("../metadata/VendorPicker", () => ({
  VendorPicker: ({ defaultValue, onWebsite }: { defaultValue?: string; onWebsite?: (url: string) => void }) => <div>
    <input name="bookedViaName" defaultValue={defaultValue} />
    <button type="button" onClick={() => onWebsite?.("")}>Choose other booking source</button>
    <button type="button" onClick={() => onWebsite?.("https://www.cleartrip.com")}>Choose Cleartrip</button>
  </div>
}));
vi.mock("../trips/api", () => ({ listItinerary: mocks.listItinerary }));
vi.mock("./api", () => ({
  DuplicateDocumentError: class DuplicateDocumentError extends Error { existingDocumentId = "existing"; },
  uploadDocument: mocks.uploadDocument,
  listInvitations: mocks.listInvitations,
  listAssociatedAccounts: mocks.listAssociatedAccounts,
  createTripMembershipOffer: mocks.createTripMembershipOffer,
  createInvitation: mocks.createInvitation,
  revokeInvitation: mocks.revokeInvitation,
  saveHotelStay: mocks.saveHotelStay,
  updateBooking: mocks.updateBooking
}));

import { EditBookingForm, ShareTripForm, UploadDocumentForm } from "./WorkspaceForms";

const trip: Trip = {
  id: "trip-1",
  title: "Autumn trip",
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

function booking(type: Booking["type"]): Booking {
  return {
    id: `booking-${type}`,
    trip_id: trip.id,
    type,
    title: type === "hotel" ? "Harbour Hotel" : "Flight to Dubai",
    provider: type === "hotel" ? "Harbour Hotel" : "Air India",
    reference_code: "ABC123",
    start_at: "2026-09-26T04:30:00.000Z",
    end_at: "2026-09-26T08:00:00.000Z",
    source_timezone: "Asia/Kolkata",
    location: { label: "Marina" },
    details: {},
    journey_scope: type === "flight" ? "international" : null,
    booked_via_name: "Direct",
    booked_via_url: null,
    contact_name: "Front desk",
    contact_phone: "+919999999999",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z"
  };
}

function hotelMilestone(eventType: "hotel_check_in" | "hotel_check_out", overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  const checkIn = eventType === "hotel_check_in";
  return {
    id: checkIn ? "check-in-1" : "check-out-1",
    trip_id: trip.id,
    booking_id: "booking-hotel",
    title: checkIn ? "Harbour Hotel · Check in" : "Harbour Hotel · Check out",
    event_type: eventType,
    starts_at: checkIn ? "2026-09-26T04:30:00.000Z" : "2026-09-26T08:00:00.000Z",
    ends_at: null,
    timezone: "Asia/Kolkata",
    location: { label: "Marina" },
    notes: null,
    applies_to_all_travelers: true,
    is_all_day: false,
    timing_mode: "exact",
    scheduled_date: null,
    has_explicit_start_time: true,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides
  };
}

describe("Upload document flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.uploadDocument.mockResolvedValue({ id: "document-1", sync_state: "synced" });
    mocks.listInvitations.mockResolvedValue([]);
    mocks.listAssociatedAccounts.mockResolvedValue([{ user_id: "account-ravi", display_name: "Ravi Singh" }]);
    mocks.createTripMembershipOffer.mockResolvedValue("offer-1");
    mocks.listItinerary.mockResolvedValue([hotelMilestone("hotel_check_in"), hotelMilestone("hotel_check_out")]);
    mocks.saveHotelStay.mockImplementation(async (input) => ({ booking: { ...booking("hotel"), id: input.bookingId }, itinerary: [] }));
    mocks.updateBooking.mockImplementation(async (input) => ({ ...booking(input.type), id: input.id }));
  });

  it("offers a later trip to a known account without creating a new code", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><ShareTripForm trip={trip} travelers={travelers} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Known account" }));
    await screen.findByRole("option", { name: "Ravi Singh" });
    await user.selectOptions(screen.getByLabelText("Previously associated account"), "account-ravi");
    await user.selectOptions(screen.getByLabelText("Which traveler are they?"), "ravi");
    await user.selectOptions(screen.getByLabelText("App access"), "editor");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(mocks.createTripMembershipOffer).toHaveBeenCalledWith({ tripId: trip.id, userId: "account-ravi", targetType: "traveler", travelerId: "ravi", role: "editor" }));
    expect(screen.getByText(/Ravi Singh can now accept Autumn trip from Home/)).toBeInTheDocument();
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("derives the Vault name from purpose and traveler while preserving the original file", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><UploadDocumentForm trip={trip} travelers={travelers} preferredTravelerId="ravi" flightLegId="flight-1" contextTitle="Flight to Dubai" onClose={onClose} /></QueryClientProvider></MemoryRouter>);

    await user.selectOptions(screen.getByLabelText("Document type"), "boarding_pass");
    expect(screen.getByText("Boarding pass · Ravi · Flight to Dubai")).toBeInTheDocument();
    const file = new window.File(["%PDF-test"], "scan-from-phone.pdf", { type: "application/pdf" });
    const fileInput = screen.getByLabelText<HTMLInputElement>("File");
    await user.upload(fileInput, file);
    expect(fileInput.files?.[0]).toBe(file);
    expect(screen.getByText("scan-from-phone.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      title: "Boarding pass · Ravi · Flight to Dubai",
      purpose: "boarding_pass",
      assignmentMode: "selected",
      travelerIds: ["ravi"],
      flightLegId: "flight-1",
      file
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("associates a journey-leg upload with that exact leg and starts as a journey ticket", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><UploadDocumentForm trip={trip} travelers={travelers} bookingId="booking-bus" journeyLegId="bus-leg-2" contextTitle="Leg 2 · DEL to DXB" onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(screen.getByLabelText("Document type")).toHaveValue("journey_ticket");
    expect(screen.getByText("Train, bus, ferry or cab ticket · Everyone · Leg 2 · DEL to DXB")).toBeInTheDocument();
    const file = new window.File(["%PDF-ticket"], "operator-ticket.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText<HTMLInputElement>("File"), file);
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: "booking-bus",
      journeyLegId: "bus-leg-2",
      category: "transport",
      purpose: "ticket",
      assignmentMode: "shared",
      file
    })));
  });

  it("keeps a custom name while retaining the derived context", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><UploadDocumentForm trip={trip} travelers={travelers} preferredTravelerId="asha" flightLegId="flight-1" contextTitle="Flight to Dubai" onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
    await user.click(screen.getByText("Traveler(s)"));
    await user.type(screen.getByLabelText("Document name (optional)"), "Asha mobile boarding pass");
    expect(screen.getByText("Asha mobile boarding pass")).toBeInTheDocument();
    expect(screen.getByText(/Trip context: Flight ticket · Asha · Flight to Dubai/)).toBeInTheDocument();
  });

  it("keeps journey endpoints authoritative when editing a flight booking", () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={booking("flight")} travelers={travelers} selectedTravelerIds={[]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(screen.getByText(/international journey/i)).toBeInTheDocument();
    expect(screen.getByText(/Edit route times, airports, stations, and connections/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Starts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ends")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contact name")).not.toBeInTheDocument();
    expect(screen.queryByText("Booking time zone")).not.toBeInTheDocument();
  });

  it("does not let a flight edit remove its required PNR", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={booking("flight")} travelers={travelers} selectedTravelerIds={[]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    await user.clear(screen.getByLabelText("Booking reference / PNR"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Add the flight booking reference / PNR.");
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("keeps flights booked without exposing an editable status", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    const existing = { ...booking("flight"), reservation_state: "planned" as const, participant_scope: "everyone" as const };
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={existing} travelers={travelers} selectedTravelerIds={[]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(screen.queryByLabelText("Booking status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      id: "booking-flight",
      reservationState: "booked",
      participantScope: "everyone",
      travelerIds: []
    })));
  });

  it("reconciles the booking website when the booked-via choice changes", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    const existing = { ...booking("flight"), booked_via_url: "https://old.example/confirmation" };
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={existing} travelers={travelers} selectedTravelerIds={[]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    const website = screen.getByLabelText("Booking website");
    expect(website).toHaveValue("https://old.example/confirmation");
    await user.click(screen.getByRole("button", { name: "Choose other booking source" }));
    expect(website).toHaveValue("");

    await user.type(website, "https://manual.example/booking");
    await user.click(screen.getByRole("button", { name: "Choose Cleartrip" }));
    expect(website).toHaveValue("https://www.cleartrip.com");
  });

  it("uses the hotel name as the property provider without exposing a timezone control", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={booking("hotel")} travelers={travelers} selectedTravelerIds={[]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    const property = screen.getByLabelText("Hotel / property name");
    await user.clear(property);
    await user.type(property, "Marina Bay Hotel");
    expect(screen.queryByText("Service provider")).not.toBeInTheDocument();
    expect(screen.queryByText("Booking time zone")).not.toBeInTheDocument();
    await screen.findByLabelText("Printed check-in time (optional)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.saveHotelStay).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: "booking-hotel",
      eventType: "hotel_check_in",
      title: "Marina Bay Hotel",
      provider: "Marina Bay Hotel",
      timezone: "Asia/Kolkata"
    })));
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("preserves date-only hotel milestones and saves both sides of the stay atomically", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    const existing = {
      ...booking("hotel"),
      participant_scope: "selected" as const,
      location: { label: "Marina", address: "1 Bay Road", map_url: "https://maps.app.goo.gl/hotel" },
      details: { room_type: "Family suite", notes: "Late arrival" }
    };
    mocks.listItinerary.mockResolvedValue([
      hotelMilestone("hotel_check_in", { starts_at: "2026-09-27T06:30:00.000Z", timing_mode: "date_only", scheduled_date: "2026-09-27", has_explicit_start_time: false }),
      hotelMilestone("hotel_check_out", { starts_at: "2026-09-29T04:30:00.000Z", timing_mode: "exact", scheduled_date: null, has_explicit_start_time: true })
    ]);
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={existing} travelers={travelers} selectedTravelerIds={["asha"]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByLabelText("Check-in date")).toHaveValue("2026-09-27");
    expect(screen.getByLabelText("Printed check-in time (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Printed checkout time (optional)")).toHaveValue("10:00");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.saveHotelStay).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: "booking-hotel",
      eventType: "hotel_check_in",
      startsAt: "2026-09-27T06:30:00.000Z",
      endsAt: "2026-09-29T04:30:00.000Z",
      hotelCheckInHasTime: false,
      hotelCheckoutHasTime: true,
      bookingDetails: { room_type: "Family suite" },
      notes: "Late arrival",
      mapUrl: "https://maps.app.goo.gl/hotel",
      participantScope: "selected",
      travelerIds: ["asha"]
    })));
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("preserves a planned booking and an explicit selected-all traveler scope", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    const existing = { ...booking("activity"), reservation_state: "planned" as const, participant_scope: "selected" as const };
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={existing} travelers={travelers} selectedTravelerIds={["asha", "ravi"]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(screen.getByLabelText("Booking status")).toHaveValue("planned");
    expect(screen.getByRole("radio", { name: "Selected travelers" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Everyone" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      id: "booking-activity",
      reservationState: "planned",
      participantScope: "selected",
      travelerIds: ["asha", "ravi"]
    })));
  });

  it("can enrich a planned ground journey into a booked ticket", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    const existing = { ...booking("train"), reservation_state: "planned" as const, participant_scope: "selected" as const };
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={existing} travelers={travelers} selectedTravelerIds={["asha"]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(screen.getByRole("option", { name: "Plan only — ticket not booked" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Buy when needed / walk-up" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ticket booked" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Booking status"), "booked");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.updateBooking).toHaveBeenCalledWith(expect.objectContaining({
      id: "booking-train",
      reservationState: "booked",
      participantScope: "selected",
      travelerIds: ["asha"]
    })));
  });

  it("keeps Everyone canonical even when legacy traveler rows are supplied", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    const existing = { ...booking("hotel"), reservation_state: "booked" as const, participant_scope: "everyone" as const };
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={existing} travelers={travelers} selectedTravelerIds={["asha", "ravi"]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(screen.getByRole("radio", { name: "Everyone" })).toBeChecked();
    await screen.findByLabelText("Printed check-in time (optional)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mocks.saveHotelStay).toHaveBeenCalledWith(expect.objectContaining({
      bookingId: "booking-hotel",
      reservationState: "booked",
      participantScope: "everyone",
      travelerIds: []
    })));
  });

  it("uses compact cab language for planned, booked, and completed rides", () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const existing = { ...booking("cab"), reservation_state: "planned" as const, participant_scope: "everyone" as const };
    render(<MemoryRouter><QueryClientProvider client={queryClient}><EditBookingForm trip={trip} booking={existing} travelers={travelers} selectedTravelerIds={[]} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    expect(screen.getByRole("option", { name: "Need a cab" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Booked in advance" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Already took this ride" })).toBeInTheDocument();
  });
});
