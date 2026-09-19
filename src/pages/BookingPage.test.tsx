import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatEventTime, formatMoney } from "../features/trips/presentation";
import { tripChildNavigationState } from "../features/trips/navigation";
import type { Trip } from "../features/trips/types";
import type { Booking, JourneyLeg } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  getBooking: vi.fn(),
  getTrip: vi.fn(),
  listCosts: vi.fn(),
  listItinerary: vi.fn(),
  listCabStopsForTrip: vi.fn(),
  listBookingTravelerIds: vi.fn(),
  listJourneyLegTravelers: vi.fn(),
  listJourneyLegsForBooking: vi.fn(),
  listMembers: vi.fn().mockResolvedValue([]),
  listTravelers: vi.fn(),
  readTravelerFocus: vi.fn()
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("../features/trips/api", () => ({
  getTrip: mocks.getTrip,
  listCosts: mocks.listCosts,
  listItinerary: mocks.listItinerary,
  archiveTripCost: vi.fn()
}));
vi.mock("../features/sync/localSync", () => ({
  localProfileId: vi.fn().mockResolvedValue("user-1")
}));
vi.mock("../features/workspace/travelerFocus", () => ({
  readTravelerFocus: mocks.readTravelerFocus
}));
vi.mock("../features/workspace/WorkspaceForms", () => ({
  EditBookingForm: () => <section aria-label="Edit booking form" />,
  UploadDocumentForm: ({
    journeyLegId,
    contextTitle
  }: {
    journeyLegId?: string;
    contextTitle?: string;
  }) => (
    <section
      aria-label="Upload document form"
      data-journey-leg-id={journeyLegId}
      data-context-title={contextTitle}
    />
  )
}));
vi.mock("../features/workspace/EditJourneyLegForm", () => ({
  EditJourneyLegForm: ({ leg }: { leg: JourneyLeg }) => (
    <section aria-label="Edit journey leg form">{leg.origin_name}</section>
  )
}));
vi.mock("../features/workspace/api", () => ({
  archiveBooking: vi.fn(),
  archiveCabStop: vi.fn(),
  listCabStopsForTrip: mocks.listCabStopsForTrip,
  getBooking: mocks.getBooking,
  googleMapsDirectionsUrl: vi.fn(() => "https://maps.example/directions"),
  googleMapsSearchUrl: vi.fn(() => "https://maps.example/search"),
  listBookingTravelerIds: mocks.listBookingTravelerIds,
  listJourneyLegTravelers: mocks.listJourneyLegTravelers,
  listJourneyLegsForBooking: mocks.listJourneyLegsForBooking,
  listMembers: mocks.listMembers,
  listTravelers: mocks.listTravelers,
  listVaultDocuments: vi.fn().mockResolvedValue([]),
  setJourneyLegTravelerDetails: vi.fn()
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

function renderPage(
  initialEntry: string | { pathname: string; state: unknown } = "/trips/trip-1/bookings/booking-1"
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[initialEntry]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/trips/:tripId/bookings/:bookingId" element={<BookingPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mocks.listCosts.mockResolvedValue([]);
  mocks.listItinerary.mockResolvedValue([]);
  mocks.listCabStopsForTrip.mockResolvedValue([]);
  mocks.listMembers.mockResolvedValue([]);
  mocks.listBookingTravelerIds.mockReset().mockResolvedValue([]);
  mocks.listJourneyLegTravelers.mockReset().mockResolvedValue([]);
  mocks.listTravelers.mockReset().mockResolvedValue([]);
  mocks.readTravelerFocus.mockReset().mockReturnValue(null);
});

describe("generic journey booking times", () => {
  beforeEach(() => {
    mocks.getBooking.mockResolvedValue(booking);
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listJourneyLegsForBooking.mockResolvedValue([leg]);
  });

  it.each([
    ["hotel", "Edit hotel"],
    ["cab", "Edit cab"],
    ["restaurant", "Edit meal"],
    ["other", "Edit booking"]
  ])("places the %s edit action beside Back above the summary", async (type, label) => {
    mocks.getBooking.mockResolvedValue({ ...booking, type });
    mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner" }]);
    renderPage();
    const edit = await screen.findByRole("button", { name: label });
    const hero = screen.getByRole("heading", { name: booking.title }).closest("header")!;
    expect(edit.closest("header")).toBeNull();
    expect(edit.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      within(edit.parentElement!).getByRole("link", { name: "Back to trip" })
    ).toBeInTheDocument();
    expect(hero.querySelector('[data-silhouette-placement="hero"]')).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    await userEvent.click(edit);
    expect(screen.getByRole("region", { name: "Edit booking form" })).toBeInTheDocument();
  });

  // Navigation does not branch on booking type. Exercise the location variants
  // below instead of mounting this same page once for every type.
  it("offers summary navigation without documents or contact details", async () => {
    mocks.getBooking.mockResolvedValue({
      ...booking,
      location: { label: "Main entrance" }
    });
    renderPage();
    const action = await screen.findByRole("link", { name: "Navigate to booking location" });
    expect(action.closest("header")).not.toBeNull();
    expect(action).toHaveAttribute("href", "https://maps.example/directions");
    expect(action).toHaveAttribute("target", "_blank");
  });

  it("supports coordinate-only locations in the summary", async () => {
    mocks.getBooking.mockResolvedValue({
      ...booking,
      location: { latitude: 0, longitude: 103.85 }
    });
    renderPage();
    expect(
      await screen.findByRole("link", { name: "Navigate to booking location" })
    ).toBeInTheDocument();
  });

  it("uses the saved map link even when no location label is present", async () => {
    mocks.getBooking.mockResolvedValue({
      ...booking,
      location: { map_url: "https://maps.google.com/?q=hotel" }
    });
    renderPage();
    expect(
      await screen.findByRole("link", { name: "Navigate to booking location" })
    ).toHaveAttribute("href", "https://maps.google.com/?q=hotel");
  });

  it("does not offer summary navigation without a location", async () => {
    renderPage();
    await screen.findByRole("heading", { name: booking.title });
    expect(
      screen.queryByRole("link", { name: "Navigate to booking location" })
    ).not.toBeInTheDocument();
  });

  it("does not count down a date-only booking as if it had a confirmed time", async () => {
    mocks.listItinerary.mockResolvedValue([
      { id: "event-1", booking_id: booking.id, timing_mode: "date_only" }
    ]);
    renderPage();
    const heading = await screen.findByRole("heading", { name: booking.title });
    expect(heading.closest("header")).not.toHaveTextContent(/to departure|Departure time passed/);
  });

  it("shows cab stops and their costs beside the journey, without an empty essentials card", async () => {
    mocks.getBooking.mockResolvedValue({ ...booking, type: "cab", reference_code: null });
    mocks.listJourneyLegsForBooking.mockResolvedValue([{ ...leg, mode: "cab" }]);
    mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner" }]);
    mocks.listCabStopsForTrip.mockResolvedValue([
      {
        id: "stop-1",
        journey_leg_id: leg.id,
        stop_order: 100,
        title: "Lunch",
        location: { label: "Cafe" },
        arrives_at: null,
        departs_at: null,
        timezone: leg.origin_timezone,
        notes: "Vegetarian options",
        linked_itinerary_item_id: null
      }
    ]);
    mocks.listCosts.mockResolvedValue([
      {
        id: "lunch-cost",
        trip_id: trip.id,
        booking_id: booking.id,
        cab_stop_id: "stop-1",
        title: "Lunch cost",
        amount_minor: 50000,
        currency_code: "INR",
        payment_status: "paid"
      }
    ]);
    renderPage();
    const stop = await screen.findByRole("listitem", { name: "Cab stop 1: Lunch" });
    expect(stop).toBeVisible();
    expect(within(stop).getByText(formatMoney(50000, "INR"))).toBeVisible();
    expect(within(stop).getByText("Vegetarian options")).toBeVisible();
    expect(screen.getByRole("button", { name: "Add stop" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Booking essentials" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit Lunch" }));
    expect(screen.getByRole("form", { name: "Edit cab stop" })).toBeVisible();
  });

  it("shows saved room and lead guest information and allows editing it", async () => {
    mocks.getBooking.mockResolvedValue({
      ...booking,
      type: "hotel",
      details: { room_type: "Family suite", room_count: 2, lead_guest: "Asha" }
    });
    mocks.listJourneyLegsForBooking.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner" }]);
    renderPage();
    await userEvent.click(await screen.findByText("Room & guest details"));
    expect(screen.getAllByText("Family suite").length).toBeGreaterThan(0);
    expect(screen.getByText("Asha")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Booking essentials" })).getByText("2")
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Edit stay details" }));
    expect(screen.getByRole("region", { name: "Edit booking form" })).toBeInTheDocument();
  });

  it.each(["FERRY-42", null])(
    "shows a ferry booking reference only when present: %s",
    async (reference) => {
      mocks.getBooking.mockResolvedValue({ ...booking, type: "ferry", reference_code: reference });
      mocks.listJourneyLegsForBooking.mockResolvedValue([{ ...leg, mode: "ferry" }]);
      renderPage();
      await screen.findByRole("article");
      if (reference) {
        expect(screen.getByText("Booking reference")).toBeVisible();
        expect(screen.getByText(reference)).toBeVisible();
      } else {
        expect(screen.queryByText("Booking reference")).not.toBeInTheDocument();
        expect(
          screen.queryByRole("region", { name: "Booking essentials" })
        ).not.toBeInTheDocument();
      }
    }
  );

  // Exact labels for every type belong to bookingPresentation.test.ts.
  // Keep the special hotel stay and a generic booking's page wiring here.
  it.each([
    ["hotel", "Check-in", "Check-out"],
    ["restaurant", "Reservation", "Ends"]
  ] as const)("uses useful schedule labels for %s bookings", async (type, startLabel, endLabel) => {
    mocks.getBooking.mockResolvedValue({ ...booking, type, provider: booking.title });
    mocks.listJourneyLegsForBooking.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(startLabel)).toBeInTheDocument();
    expect(screen.getByText(endLabel)).toBeInTheDocument();
    expect(screen.getAllByText(booking.title)).toHaveLength(1);
    if (type === "hotel") expect(screen.getByText("1 day · 0 nights")).toBeInTheDocument();
  });

  it("formats the booking end in the final destination time zone", async () => {
    renderPage();

    const expected = formatEventTime(booking.end_at!, leg.destination_timezone);
    const departureZoneValue = formatEventTime(booking.end_at!, booking.source_timezone!);
    const journey = await screen.findByRole("article");
    expect(journey).toHaveTextContent(expected);
    expect(journey).not.toHaveTextContent(departureZoneValue);
    expect(screen.queryByText("Ends")).not.toBeInTheDocument();
  });

  it("returns to the Trip details tab when that is where the booking was opened", async () => {
    renderPage({
      pathname: "/trips/trip-1/bookings/booking-1",
      state: tripChildNavigationState(null, "trip-1", "details")
    });

    expect(await screen.findByRole("link", { name: "Back to trip" })).toHaveAttribute(
      "href",
      "/trips/trip-1?view=details"
    );
  });

  it("keeps a journey useful when its source does not provide an arrival", async () => {
    mocks.listJourneyLegsForBooking.mockResolvedValue([{ ...leg, scheduled_arrival_at: null }]);

    renderPage();

    expect(await screen.findByText(/Arrival not added/)).toBeInTheDocument();
    expect(screen.getByText(/Duration not available/)).toBeInTheDocument();
  });

  it("hydrates only the travelers selected for this booking and shows their individual ticket details", async () => {
    const shantanu = {
      id: "traveler-1",
      trip_id: trip.id,
      display_name: "Shantanu",
      is_minor: false,
      created_at: "2026-09-01T00:00:00.000Z"
    };
    const rahul = { ...shantanu, id: "traveler-2", display_name: "Rahul" };
    let resolveTravelerIds!: (ids: string[]) => void;
    mocks.getBooking.mockResolvedValue({ ...booking, participant_scope: "selected" });
    mocks.listTravelers.mockResolvedValue([shantanu, rahul]);
    mocks.listBookingTravelerIds.mockReturnValue(
      new Promise<string[]>((resolve) => {
        resolveTravelerIds = resolve;
      })
    );
    mocks.listJourneyLegTravelers.mockResolvedValue([
      {
        id: "leg-1:traveler-1",
        journey_leg_id: leg.id,
        traveler_id: shantanu.id,
        seat_or_berth: "5",
        coach_or_cabin: "Executive",
        passenger_reference: "85854178"
      }
    ]);

    renderPage();

    await screen.findByRole("heading", { name: booking.title });
    expect(screen.queryByText("Traveler journey details")).not.toBeInTheDocument();
    resolveTravelerIds([shantanu.id]);

    expect(await screen.findByText("Traveler journey details")).toBeInTheDocument();
    expect(screen.getByText(/Shantanu/).closest("article")).toHaveTextContent("Seat 5");
    expect(screen.getByText(/Shantanu/).closest("article")).toHaveTextContent("85854178");
    expect(screen.queryByText(/Rahul/)).not.toBeInTheDocument();
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
      {
        user_id: "user-1",
        role: "editor",
        participation_type: "traveler",
        joined_at: "2026-09-01T00:00:00.000Z",
        display_name: "Shantanu"
      }
    ]);
  });

  it("opens the booking editor from shallow booking cards", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(
      await screen.findByRole("button", { name: "Edit journey connection 1" })
    ).toBeInTheDocument();
    await user.click(screen.getByText("Booking & contact"));
    expect(
      screen.getByRole("button", { name: "Edit Booking reference / PNR" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit booking source" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit booking contact" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit journey connection 1" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Location" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit booking notes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit bus" })).toBeInTheDocument();
    expect(document.querySelector("button button, button a, a button, a a")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Edit Booking reference / PNR" }));

    expect(screen.getByRole("region", { name: "Edit booking form" })).toBeInTheDocument();
  });

  it("opens the dedicated leg editor from a journey card", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Edit journey connection 1" }));

    expect(screen.getByRole("region", { name: "Edit journey leg form" })).toHaveTextContent(
      "Delhi"
    );
    expect(screen.queryByRole("region", { name: "Edit booking form" })).not.toBeInTheDocument();
  });

  it("opens the first journey editor directly when requested from the timeline", async () => {
    renderPage("/trips/trip-1/bookings/booking-1?editJourney=true");

    expect(await screen.findByRole("region", { name: "Edit journey leg form" })).toHaveTextContent(
      "Delhi"
    );
  });

  it("starts a leg-associated upload without triggering the card editor", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Upload" }));

    const upload = screen.getByRole("region", { name: "Upload document form" });
    expect(upload).toHaveAttribute("data-journey-leg-id", leg.id);
    expect(upload).toHaveAttribute("data-context-title", "Delhi → Dubai");
    expect(
      screen.queryByRole("button", { name: "Upload document for journey connection 1" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Edit journey leg form" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Edit booking form" })).not.toBeInTheDocument();
    expect(document.querySelector("button button, button a, a button, a a")).toBeNull();
  });

  it.each(["Whole booking", "Connection 2: Dubai → Abu Dhabi"])(
    "chooses %s through the single Documents upload action",
    async (target) => {
      mocks.listJourneyLegsForBooking.mockResolvedValue([
        leg,
        {
          ...leg,
          id: "leg-2",
          segment_order: 1,
          origin_name: "Dubai",
          destination_name: "Abu Dhabi"
        }
      ]);
      renderPage();
      await userEvent.click(await screen.findByRole("button", { name: "Upload" }));
      await userEvent.click(screen.getByRole("button", { name: target }));
      const upload = screen.getByRole("region", { name: "Upload document form" });
      if (target === "Whole booking") expect(upload).not.toHaveAttribute("data-journey-leg-id");
      else expect(upload).toHaveAttribute("data-journey-leg-id", "leg-2");
    }
  );

  it("keeps copy, booking-site, phone, and map actions independent from editing", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Booking & contact"));
    await screen.findByRole("button", { name: "Edit booking contact" });
    const independentActions = [
      screen.getByRole("button", { name: "Copy Booking reference / PNR" }),
      screen.getByRole("link", { name: "Travel vendor →" }),
      screen.getByRole("link", { name: "Call" }),
      screen.getByRole("link", { name: "WhatsApp" }),
      screen.getByRole("link", { name: "Navigate to Terminal Road, Delhi" }),
      screen.getByRole("link", { name: "WhatsApp provider" }),
      screen.getByRole("button", { name: "Copy address" })
    ];

    for (const action of independentActions) {
      if (action instanceof HTMLAnchorElement)
        action.addEventListener("click", (event) => event.preventDefault(), { once: true });
      await user.click(action);
      expect(screen.queryByRole("region", { name: "Edit booking form" })).not.toBeInTheDocument();
    }
  });

  it("renders the same cards as static details for a viewer", async () => {
    mocks.listMembers.mockResolvedValue([
      {
        user_id: "user-1",
        role: "viewer",
        participation_type: "traveler",
        joined_at: "2026-09-01T00:00:00.000Z",
        display_name: "Shantanu"
      }
    ]);
    renderPage();

    await screen.findByText("Booking reference / PNR");
    expect(screen.queryByRole("button", { name: /^Edit / })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy Booking reference / PNR" })
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Call provider" })).toBeInTheDocument();
    for (const name of ["Call provider", "WhatsApp provider", "Navigate to booking location"]) {
      const action = screen.getByRole("link", { name });
      expect(action).toHaveAttribute("title", name);
      expect(action.querySelector("svg")).not.toBeNull();
    }
    expect(screen.getByRole("link", { name: "Navigate to Terminal Road, Delhi" })).toHaveAttribute(
      "href",
      "https://maps.example/directions"
    );
    expect(screen.queryByRole("link", { name: "Open in Maps" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Directions" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "WhatsApp provider" }).querySelector("svg")
    ).not.toBeNull();
  });
});
