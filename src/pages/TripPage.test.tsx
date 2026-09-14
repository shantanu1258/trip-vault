import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip, TripCost } from "../features/trips/types";
import { tripIntentNavigationState } from "../features/trips/navigation";
import { CostDetailsSheet, TripExpensesContent } from "../features/trips/TripExpenses";
import type { Booking, FlightLeg, JourneyLeg, Traveler, TripNote } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  getTrip: vi.fn(),
  listArchivedTripItems: vi.fn().mockResolvedValue([]),
  listBookings: vi.fn().mockResolvedValue([]),
  listCosts: vi.fn().mockResolvedValue([]),
  listFlightLegsForTrip: vi.fn().mockResolvedValue([]),
  listFlightTravelers: vi.fn(),
  listJourneyLegTravelers: vi.fn().mockResolvedValue([]),
  listItinerary: vi.fn().mockResolvedValue([]),
  listJourneyLegsForTrip: vi.fn().mockResolvedValue([]),
  listMembers: vi.fn().mockResolvedValue([]),
  listNotes: vi.fn().mockResolvedValue([]),
  listRequirements: vi.fn().mockResolvedValue([]),
  listTravelers: vi.fn().mockResolvedValue([]),
  listTripBookingTravelers: vi.fn().mockResolvedValue([]),
  listTripItineraryParticipants: vi.fn().mockResolvedValue([]),
  listTripRequirementAssignees: vi.fn().mockResolvedValue([]),
  listVaultDocuments: vi.fn().mockResolvedValue([]),
  attachDocumentsToEvent: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../components/ModalSheet", () => ({ ModalSheet: ({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) => <section aria-label={title}><button type="button" onClick={onClose}>Back</button>{children}</section> }));
vi.mock("../features/readiness/OfflinePackControl", () => ({ OfflinePackControl: () => null }));
vi.mock("../features/timeline/AddEventForm", () => ({ AddEventForm: ({ onAddDocument }: { onAddDocument?: (saved: { title: string; itineraryItemId: string; bookingId?: string }, handoff?: { file?: File; kind?: "flight_ticket" }) => void }) => <section aria-label="Add event test form"><button type="button" onClick={() => onAddDocument?.({ title: "Bus to Kuala Lumpur", itineraryItemId: "saved-event", bookingId: "booking-1" })}>Add official document</button><button type="button" onClick={() => onAddDocument?.({ title: "Flight to Dubai", itineraryItemId: "saved-flight", bookingId: "booking-flight" }, { file: new File(["%PDF-ticket"], "flight-ticket.pdf", { type: "application/pdf" }), kind: "flight_ticket" })}>Save flight with selected document</button></section> }));
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
vi.mock("../features/workspace/EventDocuments", () => ({
  EventDocuments: () => null,
  EventDocumentShortcut: ({ item, travelerId }: { item: ItineraryItem; travelerId?: string | null }) => <a href={`/trips/${item.trip_id}/documents/primary-document`} data-traveler-id={travelerId ?? "everyone"}>Open Ticket</a>
}));
vi.mock("../features/workspace/TripAirlinesPanel", () => ({ TripAirlinesPanel: () => null }));
vi.mock("../features/workspace/WorkspaceForms", async () => {
  const actual = await vi.importActual<typeof import("../features/workspace/WorkspaceForms")>("../features/workspace/WorkspaceForms");
  return {
    ...actual,
    UploadDocumentForm: ({ bookingId, contextTitle, initialFile, initialKind, onUploaded }: { bookingId?: string; contextTitle?: string; initialFile?: File; initialKind?: string; onUploaded?: (documentId: string) => Promise<void> | void }) => <section aria-label="Upload official document" data-booking-id={bookingId} data-context-title={contextTitle} data-initial-file={initialFile?.name} data-initial-kind={initialKind}><button type="button" onClick={() => void onUploaded?.("document-1")}>Complete test upload</button></section>
  };
});
vi.mock("../features/workspace/api", async () => {
  const actual = await vi.importActual<typeof import("../features/workspace/api")>("../features/workspace/api");
  return {
    ...actual,
    attachDocumentsToEvent: mocks.attachDocumentsToEvent,
    listBookings: mocks.listBookings,
    listFlightLegsForTrip: mocks.listFlightLegsForTrip,
    listFlightTravelers: mocks.listFlightTravelers,
    listJourneyLegTravelers: mocks.listJourneyLegTravelers,
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

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, writable: true, value: vi.fn() });

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.listJourneyLegTravelers.mockReset().mockResolvedValue([]);
  mocks.attachDocumentsToEvent.mockReset().mockResolvedValue(undefined);
});

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

function renderDetails({ item = activity, itinerary = [], booking, flights = [], journeys = [], travelers = [], costs = [], focusedTravelerId, editable = true, onAddBooking = vi.fn(), onEdit = vi.fn(), onViewCost = vi.fn() }: { item?: ItineraryItem; itinerary?: ItineraryItem[]; booking?: Booking; flights?: FlightLeg[]; journeys?: JourneyLeg[]; travelers?: Traveler[]; costs?: TripCost[]; focusedTravelerId?: string | null; editable?: boolean; onAddBooking?: () => void; onEdit?: () => void; onViewCost?: (cost: TripCost) => void } = {}) {
  const noop = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter><EventDetailsSheet item={item} itinerary={itinerary} tripId="trip-1" booking={booking} flights={flights} journeys={journeys} travelerIds={[]} travelers={travelers} costs={costs} focusedTravelerId={focusedTravelerId} editable={editable} canMoveUp={false} canMoveDown={false} onClose={noop} onEdit={onEdit} onArchive={noop} onAddBooking={onAddBooking} onAddCost={noop} onViewCost={onViewCost} onUploadDocument={noop} onStatus={noop} onMoveUp={noop} onMoveDown={noop} /></MemoryRouter></QueryClientProvider>);
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

describe("trip summary interactions", () => {
  it("makes timeline and details readiness summaries whole-card targets without nesting their actions", async () => {
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listCosts.mockResolvedValue([]);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listRequirements.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([
      { user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/trips/trip-1"]}>
          <Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const timelineTarget = await screen.findByRole("link", { name: "Open trip readiness" });
    const timelineCard = timelineTarget.closest("section");
    expect(within(timelineCard as HTMLElement).getByRole("link", { name: "Open checklist" })).toHaveAttribute("href", "/trips/trip-1/readiness");
    expect(timelineCard?.querySelector("a a, a button, button a, button button")).toBeNull();

    view.unmount();
    const detailsClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={detailsClient}>
        <MemoryRouter initialEntries={["/trips/trip-1?view=details"]}>
          <Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const detailsTarget = await screen.findByRole("button", { name: "Open trip readiness" });
    const detailsCard = detailsTarget.closest("section");
    expect(within(detailsCard as HTMLElement).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/trips/trip-1/readiness");
    expect(detailsCard?.querySelector("a a, a button, button a, button button")).toBeNull();
  });

  it("closes People after a traveler switch, restores the card focus, and keeps the saved scroll", async () => {
    localStorage.clear();
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listCosts.mockResolvedValue([]);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listRequirements.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([
      { user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }
    ]);
    Object.defineProperty(window, "scrollY", { configurable: true, value: 420 });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/trips/trip-1?view=details"]}>
          <Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const peopleTarget = await screen.findByRole("button", { name: "Open People & sharing" });
    const peopleCard = peopleTarget.closest("section");
    expect(within(peopleCard as HTMLElement).getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(peopleCard?.querySelector("a a, a button, button a, button button")).toBeNull();

    await userEvent.click(peopleTarget);
    const peopleSheet = screen.getByRole("region", { name: "People & sharing" });
    await userEvent.click(within(peopleSheet).getByRole("button", { name: /Shubham/ }));

    await waitFor(() => expect(screen.queryByRole("region", { name: "People & sharing" })).not.toBeInTheDocument());
    await waitFor(() => expect(peopleTarget).toHaveFocus());
    expect(screen.getByText("Showing Shubham")).toBeInTheDocument();
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 420, behavior: "auto" }));

    scrollTo.mockRestore();
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  it("switches from details to the timeline and focuses search for an explicit header intent", async () => {
    sessionStorage.clear();
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listCosts.mockResolvedValue([]);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue([]);
    mocks.listRequirements.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([]);
    const previousScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoView = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const state = tripIntentNavigationState(null, "trip-1", "search", { view: "timeline" });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[{ pathname: "/trips/trip-1", search: "?view=details", state }]}>
          <Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const search = await screen.findByRole("textbox", { name: "Search this trip" });
    await waitFor(() => expect(search).toHaveFocus());
    const searchRegion = screen.getByRole("search", { name: "Search within this trip" });
    expect(screen.getByRole("heading", { name: "Complete timeline" })).toBeInTheDocument();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(scrollIntoView.mock.contexts).toContain(searchRegion);
    expect(scrollIntoView.mock.contexts).not.toContain(search);
    expect(searchRegion.className).toContain("safe-area-inset-top");

    HTMLElement.prototype.scrollIntoView = previousScrollIntoView;
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

describe("timeline event primary document", () => {
  it("keeps the document shortcut independent from the whole-card details target", async () => {
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listItinerary.mockResolvedValue([activity]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([{ user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/trip-1"]}><Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    const cardTarget = await screen.findByRole("button", { name: "Open details for Museum visit" });
    const shortcut = screen.getByRole("link", { name: "Open Ticket" });
    const card = cardTarget.closest("article") ?? cardTarget.parentElement;
    expect(cardTarget.contains(shortcut)).toBe(false);
    expect(card?.querySelector("button button, button a, a button, a a")).toBeNull();
    expect(shortcut).toHaveAttribute("data-traveler-id", "everyone");

    shortcut.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await userEvent.click(shortcut);
    expect(screen.queryByRole("region", { name: "Museum visit" })).not.toBeInTheDocument();

    await userEvent.click(cardTarget);
    expect(screen.getByRole("region", { name: "Museum visit" })).toBeInTheDocument();
  });
});

describe("timeline booking-at-a-glance details", () => {
  it("shows flight booking state, boarding, gate, and focused seat details on the timeline card", async () => {
    const flightBooking: Booking = {
      id: "flight-booking", trip_id: ownerTrip.id, type: "flight", title: "Flight to Dubai", provider: "Air India", reference_code: "PNR123",
      start_at: "2026-09-28T03:30:00.000Z", end_at: "2026-09-28T08:00:00.000Z", source_timezone: "Asia/Kolkata", location: null,
      details: {}, reservation_state: "booked", participant_scope: "everyone", journey_scope: "international", created_at: "2026-09-01T00:00:00.000Z"
    };
    const flight: FlightLeg = {
      id: "flight-leg", booking_id: flightBooking.id, segment_order: 0, airline_name: "Air India", flight_number: "AI 995",
      departure_airport_code: "DEL", departure_airport_name: "Delhi", arrival_airport_code: "DXB", arrival_airport_name: "Dubai",
      scheduled_departure_at: flightBooking.start_at!, scheduled_arrival_at: flightBooking.end_at!, estimated_departure_at: null, estimated_arrival_at: null,
      actual_departure_at: null, actual_arrival_at: null, departure_timezone: "Asia/Kolkata", arrival_timezone: "Asia/Dubai",
      boarding_at: "2026-09-28T02:45:00.000Z", boarding_lead_minutes: 45, departure_terminal: "3", departure_gate: "12", arrival_terminal: "1", arrival_gate: null,
      baggage_claim: null, status: "scheduled", status_note: null, status_updated_by: "owner-user", status_updated_at: "2026-09-01T00:00:00.000Z"
    };
    localStorage.setItem("trip-vault:traveler-focus:trip-1", "traveler-1");
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listItinerary.mockResolvedValue([{ ...activity, id: "flight-event", title: flightBooking.title, event_type: "flight", booking_id: flightBooking.id, applies_to_all_travelers: true }]);
    mocks.listBookings.mockResolvedValue([flightBooking]);
    mocks.listFlightLegsForTrip.mockResolvedValue([flight]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([{ user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }]);
    mocks.listTripBookingTravelers.mockResolvedValue([]);
    mocks.listTripItineraryParticipants.mockResolvedValue([]);
    mocks.listFlightTravelers.mockResolvedValue([{ id: "flight-leg:traveler-1", flight_leg_id: flight.id, traveler_id: "traveler-1", seat: "12A", boarding_group: "2", ticket_number: null }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/trip-1"]}><Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText("Shantanu · Seat 12A · Group 2")).toBeInTheDocument();
    expect(screen.getByText("booked")).toBeInTheDocument();
    expect(screen.getByText(/Board .*T3.*Gate 12/)).toBeInTheDocument();
  });

  it("keeps a cab call shortcut independent from opening the timeline event", async () => {
    const cabBooking: Booking = {
      id: "cab-booking", trip_id: ownerTrip.id, type: "cab", title: "Airport transfer", provider: "Grab", reference_code: null,
      start_at: "2026-09-28T03:30:00.000Z", end_at: null, source_timezone: "Asia/Singapore", location: null, details: {}, reservation_state: "booked",
      participant_scope: "everyone", journey_scope: "domestic", contact_phone: "+6591234567", created_at: "2026-09-01T00:00:00.000Z"
    };
    const cabLeg: JourneyLeg = {
      id: "cab-leg", booking_id: cabBooking.id, segment_order: 0, mode: "cab", operator_name: "Grab", service_number: null,
      origin_code: null, origin_name: "Changi Airport", origin_country_code: "SG", origin_timezone: "Asia/Singapore", destination_code: null,
      destination_name: "Hotel", destination_country_code: "SG", destination_timezone: "Asia/Singapore", scheduled_departure_at: cabBooking.start_at!,
      scheduled_arrival_at: null, boarding_at: null, boarding_lead_minutes: null, departure_platform: null, arrival_platform: null, coach_or_cabin: null,
      seat: null, details: { kind: "cab", ride_type: "airport_transfer" }, status_note: null
    };
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listItinerary.mockResolvedValue([{ ...activity, id: "cab-event", title: cabBooking.title, event_type: "cab", booking_id: cabBooking.id }]);
    mocks.listBookings.mockResolvedValue([cabBooking]);
    mocks.listFlightLegsForTrip.mockResolvedValue([]);
    mocks.listJourneyLegsForTrip.mockResolvedValue([cabLeg]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([{ user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/trip-1"]}><Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    const cardTarget = await screen.findByRole("button", { name: "Open details for Airport transfer" });
    const call = screen.getByRole("link", { name: "Call cab contact" });
    expect(call).toHaveAttribute("href", "tel:+6591234567");
    expect(cardTarget.contains(call)).toBe(false);
    call.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await userEvent.click(call);
    expect(screen.queryByRole("region", { name: "Airport transfer" })).not.toBeInTheDocument();
  });
});

describe("hotel timeline editing", () => {
  it("opens the atomic hotel booking editor from either stay milestone", async () => {
    const hotelBooking: Booking = {
      id: "hotel-booking-1", trip_id: ownerTrip.id, type: "hotel", title: "Palm Springs Hotel", provider: "Palm Springs Hotel", reference_code: "HOTEL123",
      start_at: "2026-09-28T08:00:00.000Z", end_at: "2026-09-30T04:00:00.000Z", source_timezone: "Asia/Dubai", location: { label: "Palm Jumeirah" },
      details: {}, participant_scope: "everyone", journey_scope: null, reservation_state: "booked", created_at: "2026-09-01T00:00:00.000Z"
    };
    const checkIn: ItineraryItem = {
      ...activity,
      id: "hotel-check-in-1",
      booking_id: hotelBooking.id,
      title: "Check in · Palm Springs Hotel",
      event_type: "hotel_check_in",
      starts_at: hotelBooking.start_at!,
      timezone: "Asia/Dubai"
    };
    const checkout: ItineraryItem = {
      ...activity,
      id: "hotel-checkout-1",
      booking_id: hotelBooking.id,
      title: "Check out · Palm Springs Hotel",
      event_type: "hotel_check_out",
      starts_at: hotelBooking.end_at!,
      timezone: "Asia/Dubai"
    };
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listItinerary.mockResolvedValue([checkIn, checkout]);
    mocks.listBookings.mockResolvedValue([hotelBooking]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([{ user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/trip-1"]}><Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("button", { name: "Open details for Check out · Palm Springs Hotel" }));
    const eventDetails = screen.getByRole("region", { name: "Check out · Palm Springs Hotel" });
    await userEvent.click(within(eventDetails).getByRole("button", { name: "Edit event" }));

    expect(screen.queryByRole("region", { name: "Check out · Palm Springs Hotel" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Edit booking" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Stay" })).toBeInTheDocument();
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

describe("ground journey traveler details", () => {
  const busBooking: Booking = {
    id: "booking-1", trip_id: "trip-1", type: "bus", title: "Bus to Kuala Lumpur", provider: "Qistna Express", reference_code: "SGV8G20684227",
    start_at: "2026-09-30T01:00:00.000Z", end_at: "2026-09-30T06:51:00.000Z", source_timezone: "Asia/Singapore", location: null,
    details: {}, participant_scope: "everyone", journey_scope: "international", created_at: "2026-09-01T00:00:00.000Z"
  };
  const busLeg: JourneyLeg = {
    id: "bus-leg-1", booking_id: busBooking.id, segment_order: 0, mode: "bus", operator_name: "Qistna Express", service_number: null,
    origin_code: null, origin_name: "Bugis MRT Exit D", origin_country_code: "SG", origin_timezone: "Asia/Singapore",
    destination_code: null, destination_name: "KL Sentral", destination_country_code: "MY", destination_timezone: "Asia/Kuala_Lumpur",
    scheduled_departure_at: busBooking.start_at!, scheduled_arrival_at: busBooking.end_at!, boarding_at: null, boarding_lead_minutes: null,
    departure_platform: null, arrival_platform: null, coach_or_cabin: null, seat: null, details: { kind: "bus" }, status_note: null
  };

  it("shows only the focused passenger's bus seat and reference inside the opened event", async () => {
    mocks.listJourneyLegTravelers.mockResolvedValue([
      { id: "bus-leg-1:traveler-1", journey_leg_id: busLeg.id, traveler_id: "traveler-1", seat_or_berth: "5", coach_or_cabin: null, passenger_reference: "85854178" },
      { id: "bus-leg-1:traveler-2", journey_leg_id: busLeg.id, traveler_id: "traveler-2", seat_or_berth: "9", coach_or_cabin: null, passenger_reference: "85854179" }
    ]);

    renderDetails({ item: { ...activity, event_type: "bus", booking_id: busBooking.id }, booking: busBooking, journeys: [busLeg], travelers: expenseTravelers, focusedTravelerId: "traveler-2" });

    expect(await screen.findByText(/Shubham.*Seat 9.*85854179/)).toBeInTheDocument();
    expect(screen.queryByText(/Shantanu.*Seat 5/)).not.toBeInTheDocument();
  });

  it("uses those passenger allocations in the timeline summary instead of a shared legacy seat", async () => {
    localStorage.setItem("trip-vault:traveler-focus:trip-1", "traveler-2");
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listItinerary.mockResolvedValue([{ ...activity, id: "bus-event", event_type: "bus", booking_id: busBooking.id }]);
    mocks.listBookings.mockResolvedValue([busBooking]);
    mocks.listJourneyLegsForTrip.mockResolvedValue([{ ...busLeg, seat: "OLD-SHARED-SEAT" }]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([{ user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }]);
    mocks.listJourneyLegTravelers.mockResolvedValue([
      { id: "bus-leg-1:traveler-1", journey_leg_id: busLeg.id, traveler_id: "traveler-1", seat_or_berth: "5", coach_or_cabin: null, passenger_reference: "85854178" },
      { id: "bus-leg-1:traveler-2", journey_leg_id: busLeg.id, traveler_id: "traveler-2", seat_or_berth: "9", coach_or_cabin: null, passenger_reference: "85854179" }
    ]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/trip-1"]}><Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    expect(await screen.findByText(/Shubham.*Seat 9.*85854179/)).toBeInTheDocument();
    expect(screen.queryByText(/Shantanu.*Seat 5/)).not.toBeInTheDocument();
    expect(screen.queryByText(/OLD-SHARED-SEAT/)).not.toBeInTheDocument();
  });
});

describe("new event document handoff", () => {
  it("opens upload from the saved-event confirmation and attaches the official document to that event", async () => {
    const savedEvent: ItineraryItem = { ...activity, id: "saved-event", booking_id: "booking-1", title: "Bus to Kuala Lumpur", event_type: "bus" };
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listItinerary.mockResolvedValue([savedEvent]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([{ user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/trip-1?add=event"]}><Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("button", { name: "Add official document" }));
    const upload = screen.getByRole("region", { name: "Upload official document" });
    expect(upload).toHaveAttribute("data-booking-id", "booking-1");
    expect(upload).toHaveAttribute("data-context-title", "Bus to Kuala Lumpur");
    await userEvent.click(within(upload).getByRole("button", { name: "Complete test upload" }));

    await waitFor(() => expect(mocks.attachDocumentsToEvent).toHaveBeenCalledWith(savedEvent, ["document-1"]));
  });

  it("carries a flight ticket selected during creation into the safe upload step", async () => {
    const savedFlight: ItineraryItem = { ...activity, id: "saved-flight", booking_id: "booking-flight", title: "Flight to Dubai", event_type: "flight" };
    mocks.getTrip.mockResolvedValue(ownerTrip);
    mocks.listItinerary.mockResolvedValue([savedFlight]);
    mocks.listTravelers.mockResolvedValue(expenseTravelers);
    mocks.listMembers.mockResolvedValue([{ user_id: "owner-user", role: "owner", participation_type: "traveler", joined_at: "2026-09-01T00:00:00.000Z", display_name: "Shantanu" }]);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={["/trips/trip-1?add=event"]}><Routes><Route path="/trips/:tripId" element={<TripPage />} /></Routes></MemoryRouter></QueryClientProvider>);

    await userEvent.click(await screen.findByRole("button", { name: "Save flight with selected document" }));
    const upload = screen.getByRole("region", { name: "Upload official document" });
    expect(upload).toHaveAttribute("data-booking-id", "booking-flight");
    expect(upload).toHaveAttribute("data-context-title", "Flight to Dubai");
    expect(upload).toHaveAttribute("data-initial-file", "flight-ticket.pdf");
    expect(upload).toHaveAttribute("data-initial-kind", "flight_ticket");
    await userEvent.click(within(upload).getByRole("button", { name: "Complete test upload" }));

    await waitFor(() => expect(mocks.attachDocumentsToEvent).toHaveBeenCalledWith(savedFlight, ["document-1"]));
  });
});
