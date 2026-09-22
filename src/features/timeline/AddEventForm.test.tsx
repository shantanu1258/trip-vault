import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip } from "../trips/types";
import type { FlightLeg, Traveler } from "../workspace/types";
import type { DocumentKind } from "../workspace/documentModel";
import { ConfirmDialogProvider } from "../../components/ConfirmDialogProvider";

const mocks = vi.hoisted(() => ({
  addBookedTimelineEvent: vi.fn(),
  addCabStop: vi.fn(),
  addFlightBooking: vi.fn(),
  addItineraryItem: vi.fn(),
  addJourneyBooking: vi.fn(),
  addTripCost: vi.fn(),
  listFlightLegsForTrip: vi.fn(),
  listItinerary: vi.fn(),
  saveOptionalCostForCreatedEvent: vi.fn(),
  setItineraryItemStatus: vi.fn(),
  suggestCatalogValue: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({
  ModalSheet: ({
    children,
    title,
    onClose
  }: {
    children: React.ReactNode;
    title: string;
    onClose: () => void;
  }) => (
    <section aria-label={title}>
      <button onClick={onClose}>Back</button>
      {children}
    </section>
  )
}));
vi.mock("../metadata/AirlinePicker", () => ({
  AirlinePicker: ({ name }: { name: string }) => (
    <>
      <input aria-label="Airline" name={name} />
      <input name={`${name}Source`} value="catalog" readOnly />
    </>
  )
}));
vi.mock("../metadata/AirportPicker", () => ({
  AirportPicker: ({
    name,
    codeName,
    timezoneName,
    countryName,
    label
  }: {
    name: string;
    codeName: string;
    timezoneName: string;
    countryName: string;
    label: string;
  }) => (
    <>
      <input aria-label={label} name={name} />
      <input name={codeName} value={label === "From airport" ? "BLR" : "DXB"} readOnly />
      <input
        name={timezoneName}
        value={label === "From airport" ? "Asia/Kolkata" : "Asia/Dubai"}
        readOnly
      />
      <input name={countryName} value={label === "From airport" ? "IN" : "AE"} readOnly />
      <input name={`${name}Source`} value="catalog" readOnly />
    </>
  )
}));
vi.mock("../metadata/JourneyOperatorPicker", () => ({
  JourneyOperatorPicker: ({ mode, name }: { mode: string; name: string }) => (
    <input aria-label={`${mode[0].toUpperCase()}${mode.slice(1)} operator`} name={name} />
  )
}));
vi.mock("../metadata/VendorPicker", () => ({
  VendorPicker: () => (
    <>
      <input aria-label="Booked via choice" name="bookedViaName" />
      <input name="bookedViaNameSource" value="catalog" readOnly />
    </>
  )
}));
vi.mock("../trips/api", () => ({
  addItineraryItem: mocks.addItineraryItem,
  addTripCost: mocks.addTripCost,
  listItinerary: mocks.listItinerary,
  setItineraryItemStatus: mocks.setItineraryItemStatus
}));
vi.mock("../workspace/api", () => ({
  addBookedTimelineEvent: mocks.addBookedTimelineEvent,
  addCabStop: mocks.addCabStop,
  addFlightBooking: mocks.addFlightBooking,
  addJourneyBooking: mocks.addJourneyBooking,
  listFlightLegsForTrip: mocks.listFlightLegsForTrip,
  saveOptionalCostForCreatedEvent: mocks.saveOptionalCostForCreatedEvent,
  suggestCatalogValue: mocks.suggestCatalogValue
}));

import { AddEventForm, assertSequentialConnectionTimes } from "./AddEventForm";
import { suggestedFlightLocalTime } from "./JourneyEventFields";

const trip: Trip = {
  id: "trip-1",
  title: "Autumn trip",
  destination_summary: "Singapore",
  start_date: "2026-09-26",
  end_date: "2026-10-12",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};
const travelers: Traveler[] = [
  {
    id: "traveler-1",
    trip_id: trip.id,
    display_name: "Shantanu",
    is_minor: false,
    created_at: "2026-09-01T00:00:00.000Z"
  }
];
const secondTraveler: Traveler = {
  id: "traveler-2",
  trip_id: trip.id,
  display_name: "Mira",
  is_minor: false,
  created_at: "2026-09-01T00:00:00.000Z"
};
const anchor: ItineraryItem = {
  id: "anchor-1",
  trip_id: trip.id,
  booking_id: "hotel-1",
  title: "Marina hotel · Check in",
  event_type: "hotel_check_in",
  starts_at: "2026-09-28T09:30:00.000Z",
  ends_at: null,
  timezone: "Asia/Kolkata",
  location: null,
  notes: null,
  applies_to_all_travelers: true,
  is_all_day: false,
  timing_mode: "exact",
  scheduled_date: "2026-09-28",
  has_explicit_start_time: true,
  event_status: "planned",
  created_at: "2026-09-01T00:00:00.000Z"
};
const linkedFlight = {
  id: "dd406f17-d2c8-4e72-bdea-1f1239c2bded",
  booking_id: "booking-flight",
  segment_order: 0,
  airline_name: "Air India",
  flight_number: "AI 909",
  departure_airport_code: "BLR",
  departure_airport_name: "Bengaluru",
  arrival_airport_code: "DXB",
  arrival_airport_name: "Dubai"
} as FlightLeg;

function renderForm(
  withTravelers: Traveler[] = [],
  tripValue: Trip = trip,
  documentToAttach?: { id: string; title: string },
  initialType?: import("../trips/types").TimelineEventType
) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
  });
  const onClose = vi.fn();
  const onAddDocument = vi.fn();
  const onTypeChange = vi.fn();
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <ConfirmDialogProvider>
        <AddEventForm
          trip={tripValue}
          travelers={withTravelers}
          documentToAttach={documentToAttach}
          initialType={initialType}
          onClose={onClose}
          onTypeChange={onTypeChange}
          onAddDocument={onAddDocument}
        />
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
  return { user, onClose, onTypeChange, onAddDocument };
}

// Check each type's document default in its existing form workflow, avoiding
// another full form mount just to inspect the same picker.
function expectOfficialDocumentPicker(kind: DocumentKind) {
  expect(screen.getByText("Attach an official document (optional)")).toBeInTheDocument();
  expect(screen.getByLabelText("Document type")).toHaveValue(kind);
  expect(screen.getByLabelText("Official document")).toBeInTheDocument();
}

describe("event form architecture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listItinerary.mockResolvedValue([anchor]);
    mocks.addItineraryItem.mockResolvedValue({ ...anchor, id: "item-1", booking_id: null });
    mocks.addBookedTimelineEvent.mockResolvedValue({
      booking: { id: "booking-1" },
      itinerary: [{ ...anchor, id: "item-1" }]
    });
    mocks.addFlightBooking.mockResolvedValue({
      booking: { id: "booking-1" },
      flights: [],
      itinerary: { ...anchor, id: "item-1" }
    });
    mocks.addJourneyBooking.mockResolvedValue({
      booking: { id: "booking-1" },
      legs: [{ id: "journey-leg-1" }],
      itinerary: { ...anchor, id: "item-1" }
    });
    mocks.addCabStop.mockResolvedValue({ id: "cab-stop-1" });
    mocks.listFlightLegsForTrip.mockResolvedValue([linkedFlight]);
    mocks.saveOptionalCostForCreatedEvent.mockResolvedValue(undefined);
    mocks.setItineraryItemStatus.mockResolvedValue(undefined);
    mocks.suggestCatalogValue.mockResolvedValue(undefined);
  });

  it("puts the frequent choices first in the approved order", () => {
    renderForm();
    expect(
      screen
        .getAllByRole("button")
        .filter((button) => button.textContent !== "Back")
        .slice(0, 8)
        .map((button) => button.textContent?.replace(/\s+/g, " ").trim())
    ).toEqual([
      "FlightDirect or connected flights",
      "HotelA stay with check-in and checkout",
      "ActivityVisit, tour, ticket, or free time",
      "BusCoach, shuttle, or local bus",
      "CabLocal ride, transfer, or outstation",
      "Ferry / boatPassenger or vehicle sailing",
      "TrainRail plan, ticket, or connection",
      "MealLunch, dinner, or reservation"
    ]);
  });

  it("opens a URL-selected type directly and reports a return to the type chooser", async () => {
    const { user, onTypeChange } = renderForm([], trip, undefined, "flight");

    expect(screen.getByRole("region", { name: "Add Flight" })).toBeInTheDocument();
    expect(screen.queryByText("Direct or connected flights")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change event type" }));
    expect(onTypeChange).toHaveBeenCalledWith(null);
  });

  it("keeps entered event details on cancelled Back and confirms changing the event type", async () => {
    const { user, onClose, onTypeChange } = renderForm([], trip, undefined, "activity");
    await user.type(screen.getByLabelText("Activity name"), "Museum visit");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Activity name")).toHaveValue("Museum visit");
    await user.click(screen.getByRole("button", { name: "Change event type" }));
    expect(onTypeChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(onTypeChange).toHaveBeenCalledWith(null);
  });

  it("protects a selected attachment even with the other event fields empty", async () => {
    const { user, onClose } = renderForm([], trip, undefined, "activity");
    await user.upload(
      screen.getByLabelText("Official document"),
      new File(["%PDF-test"], "ticket.pdf", { type: "application/pdf" })
    );
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /ticket.pdf/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Discard and leave" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("protects picker changes even when no text field was edited", async () => {
    const { user, onClose } = renderForm([], trip, undefined, "activity");
    const timezone = document.querySelector<HTMLInputElement>('input[name="timezone"]')!;
    expect(timezone).not.toBeNull();
    timezone.value = "Asia/Dubai";
    fireEvent.input(timezone);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Keep editing" })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("links a previously uploaded document after its new event is saved", async () => {
    const { user, onAddDocument, onClose } = renderForm([], trip, {
      id: "document-1",
      title: "Museum admission · Everyone"
    });
    expect(
      screen.getByText(/Create the timeline event for “Museum admission · Everyone”/)
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Activity Visit, tour, ticket, or free time/i })
    );
    await user.type(screen.getByLabelText("Activity name"), "Museum visit");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() =>
      expect(onAddDocument).toHaveBeenCalledWith(
        {
          title: "Museum visit",
          itineraryItemId: "item-1",
          participantScope: "everyone",
          travelerIds: []
        },
        { documentId: "document-1" }
      )
    );
    expect(await screen.findByText("Document linked to this event.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledWith("item-1");
  });

  it("keeps hotel times optional, validates checkout, and saves both milestone time flags", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Hotel A stay with check-in and checkout/i })
    );
    expect(screen.getByLabelText("Check-in date")).toHaveValue("2026-09-26");
    expectOfficialDocumentPicker("hotel_confirmation");
    expect(screen.getByLabelText("Checkout date")).toHaveValue("2026-09-27");
    expect(screen.getByLabelText("Printed check-in time (optional)")).toHaveValue("");
    expect(screen.queryByText(/clock repeats/i)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Reservation confirmed/ })).toBeChecked();
    await user.type(screen.getByLabelText("Hotel / property name"), "Marina hotel");
    fireEvent.change(screen.getByLabelText("Checkout date"), { target: { value: "2026-09-26" } });
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Hotel checkout date and time must be after check-in"
    );
    fireEvent.change(screen.getByLabelText("Checkout date"), { target: { value: "2026-09-27" } });
    fireEvent.change(screen.getByLabelText("Printed check-in time (optional)"), {
      target: { value: "15:00" }
    });
    fireEvent.change(screen.getByLabelText("Printed checkout time (optional)"), {
      target: { value: "11:00" }
    });
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addBookedTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Marina hotel",
          reservationState: "booked",
          participantScope: "everyone",
          startsAt: "2026-09-26T09:30:00.000Z",
          endsAt: "2026-09-27T05:30:00.000Z",
          hotelCheckInHasTime: true,
          hotelCheckoutHasTime: true
        })
      )
    );
    expect(await screen.findByRole("heading", { name: "Marina hotel" })).toBeInTheDocument();
  });

  it("creates a direct international flight with airport zones, boarding lead, and traveler ticket data", async () => {
    const { user, onAddDocument } = renderForm(travelers);
    await user.click(screen.getByRole("button", { name: /Flight Direct or connected flights/i }));
    expect(screen.getByRole("radio", { name: "Direct" })).toBeChecked();
    expectOfficialDocumentPicker("flight_ticket");
    expect(screen.getByText("Flight details")).toBeInTheDocument();
    expect(screen.queryByLabelText("Contact name")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "International" }));
    expect(screen.queryByRole("button", { name: "Journey time zone" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Timeline title"), "Flight to Dubai");
    await user.type(screen.getByLabelText(/Booking reference \/ PNR/), "PNR123");
    await user.type(screen.getByLabelText("Airline"), "Air India");
    await user.type(screen.getByLabelText("Flight number"), "AI 909");
    await user.type(screen.getByLabelText("From airport"), "Bengaluru Airport");
    await user.type(screen.getByLabelText("To airport"), "Dubai Airport");
    await user.click(screen.getByText("Boarding, terminal, and gate"));
    await user.type(screen.getByLabelText("Boarding lead (minutes)"), "45");
    expect(screen.getByText(/Calculated boarding time: 2026-09-26 08:15/)).toBeInTheDocument();
    await user.click(screen.getByText("Traveler ticket details"));
    await user.type(screen.getByLabelText("Seat"), "14A");
    await user.type(screen.getByLabelText("Boarding group"), "2");
    const ticket = new window.File(["%PDF-flight-ticket"], "flight-ticket.pdf", {
      type: "application/pdf"
    });
    await user.upload(screen.getByLabelText<HTMLInputElement>("Official document"), ticket);
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addFlightBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceCode: "PNR123",
          participantScope: "everyone",
          travelerIds: [],
          legs: [
            expect.objectContaining({
              airlineName: "Air India",
              departureCode: "BLR",
              arrivalCode: "DXB",
              boardingLeadMinutes: 45,
              travelerAllocations: [
                expect.objectContaining({
                  travelerId: "traveler-1",
                  seat: "14A",
                  boardingGroup: "2"
                })
              ]
            })
          ]
        })
      )
    );
    await waitFor(() =>
      expect(onAddDocument).toHaveBeenCalledWith(
        {
          title: "Flight to Dubai",
          bookingId: "booking-1",
          itineraryItemId: "item-1",
          participantScope: "everyone",
          travelerIds: []
        },
        { file: ticket, kind: "flight_ticket" }
      )
    );
  });

  it("offers a booking-confirmation picker for Other events", async () => {
    const { user } = renderForm(travelers);
    await user.click(screen.getByRole("button", { name: /Other Anything else on the timeline/i }));
    expectOfficialDocumentPicker("booking_confirmation");
  });

  it("uploads an activity document with the saved event and inherited traveler scope", async () => {
    const { user, onAddDocument } = renderForm(travelers);
    await user.click(
      screen.getByRole("button", { name: /Activity Visit, tour, ticket, or free time/i })
    );
    await user.type(screen.getByLabelText("Activity name"), "Museum visit");
    const confirmation = new window.File(["%PDF-confirmation"], "museum.pdf", {
      type: "application/pdf"
    });
    expectOfficialDocumentPicker("activity_confirmation");
    await user.upload(screen.getByLabelText<HTMLInputElement>("Official document"), confirmation);
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() =>
      expect(onAddDocument).toHaveBeenCalledWith(
        {
          title: "Museum visit",
          itineraryItemId: "item-1",
          participantScope: "everyone",
          travelerIds: []
        },
        { file: confirmation, kind: "activity_confirmation" }
      )
    );
  });

  it("starts a connecting flight with two legs and validates chronological connections", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("button", { name: /Flight Direct or connected flights/i }));
    await user.click(screen.getByRole("radio", { name: "Connecting flights" }));
    expect(screen.getAllByLabelText("Flight number")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Add connecting flight" })).toBeInTheDocument();
    expect(() =>
      assertSequentialConnectionTimes(
        [
          { departureAt: "2026-09-26T02:00:00.000Z", arrivalAt: "2026-09-26T05:00:00.000Z" },
          { departureAt: "2026-09-26T05:00:00.000Z", arrivalAt: "2026-09-26T08:00:00.000Z" }
        ],
        "flight"
      )
    ).toThrow("Connection 2 must depart after the previous flight arrives.");
    expect(suggestedFlightLocalTime("2026-09-26T12:00", "Asia/Dubai", "Asia/Dubai", 120)).toBe(
      "2026-09-26T14:00"
    );
    expect(suggestedFlightLocalTime("2026-09-26T14:00", "Asia/Dubai", "Asia/Singapore", 180)).toBe(
      "2026-09-26T21:00"
    );
  });

  it("uses a compact domestic bus form, optional arrival, and per-traveler seats", async () => {
    const { user } = renderForm(travelers);
    await user.click(screen.getByRole("button", { name: /Bus Coach, shuttle, or local bus/i }));
    expect(screen.getByRole("radio", { name: "Single bus" })).toBeChecked();
    expectOfficialDocumentPicker("journey_ticket");
    expect(screen.getByText("bus details", { exact: false })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Journey country/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Origin time zone")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Arrival (local time, optional)")).toHaveValue("");
    await user.click(screen.getByRole("radio", { name: /^Ticket booked/ }));
    await user.type(screen.getByLabelText("Timeline title"), "Bus to Kuala Lumpur");
    await user.type(screen.getByLabelText("Bus operator"), "Qistna Express");
    await user.type(screen.getByLabelText("Boarding point"), "Bugis MRT Exit D");
    await user.type(screen.getByLabelText("Boarding point code (optional)"), "BUG");
    await user.type(screen.getByLabelText("Drop-off point"), "KL Sentral");
    await user.type(screen.getByLabelText("Drop-off point code (optional)"), "KLS");
    const routeHeading = screen.getByText("BUG → KLS bus");
    const routeDetails = routeHeading.closest("details");
    expect(routeDetails).toHaveAttribute("open");
    await user.click(routeHeading);
    expect(routeDetails).not.toHaveAttribute("open");
    await user.click(routeHeading);
    expect(screen.getByLabelText("Boarding point")).toHaveValue("Bugis MRT Exit D");
    await user.click(screen.getByText("Traveler ticket details"));
    await user.type(screen.getByLabelText("Seat"), "5");
    expect(screen.queryByLabelText(/Coach|Cabin/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "bus",
          reservationState: "booked",
          journeyScope: "domestic",
          legs: [
            expect.objectContaining({
              arrivalAt: undefined,
              details: expect.objectContaining({ kind: "bus" }),
              travelerAllocations: [
                expect.objectContaining({ travelerId: "traveler-1", seatOrBerth: "5" })
              ]
            })
          ]
        })
      )
    );
  });

  it.each([
    {
      mode: "bus",
      choice: /Bus Coach, shuttle, or local bus/i,
      origin: "Boarding point",
      destination: "Drop-off point"
    },
    {
      mode: "train",
      choice: /Train Rail plan, ticket, or connection/i,
      origin: "Boarding station",
      destination: "Destination station"
    },
    {
      mode: "ferry",
      choice: /Ferry \/ boat Passenger or vehicle sailing/i,
      origin: "Departure terminal or pier",
      destination: "Arrival terminal or pier"
    }
  ])(
    "lets a $mode keep its local ticket time while placing it before or after another event",
    async ({ mode, choice, origin, destination }) => {
      mocks.listItinerary.mockResolvedValue([
        anchor,
        {
          ...anchor,
          id: "furthest-event",
          title: "Furthest local event",
          starts_at: "2026-10-01T01:00:00.000Z",
          timezone: "Asia/Singapore",
          created_at: "2026-08-01T00:00:00.000Z"
        }
      ]);
      const { user } = renderForm();
      await user.click(screen.getByRole("button", { name: choice }));
      expect(screen.getByRole("button", { name: "Journey time zone" })).toHaveTextContent(
        "Singapore"
      );
      await user.selectOptions(screen.getByLabelText("Place in timeline"), "relative");
      await waitFor(() => expect(screen.getByLabelText("Event")).toHaveTextContent(anchor.title));
      await user.selectOptions(screen.getByLabelText("Event"), anchor.id);
      await user.type(screen.getByLabelText("Timeline title"), `${mode} after hotel checkout`);
      await user.type(screen.getByLabelText(origin), "Hotel entrance");
      await user.type(screen.getByLabelText(destination), "KL Sentral");
      await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

      await waitFor(() =>
        expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
          expect.objectContaining({
            mode,
            legs: [
              expect.objectContaining({
                originTimezone: "Asia/Singapore",
                destinationTimezone: "Asia/Singapore"
              })
            ],
            itineraryTiming: expect.objectContaining({
              timingMode: "relative",
              anchorItineraryItemId: anchor.id,
              relativePosition: "after",
              hasExplicitStartTime: true,
              timezone: "Asia/Singapore"
            })
          })
        )
      );
    }
  );

  it("keeps international bus country codes optional while requiring endpoint time zones", async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole("button", { name: /Bus Coach, shuttle, or local bus/i }));
    await user.click(screen.getByRole("radio", { name: "International" }));

    const departureCountry = screen.getByLabelText("Departure country code (optional)");
    const arrivalCountry = screen.getByLabelText("Arrival country code (optional)");
    expect(departureCountry).not.toBeRequired();
    expect(arrivalCountry).not.toBeRequired();
    expect(departureCountry).toHaveAttribute("pattern", "[A-Za-z]{2}");
    await user.type(departureCountry, "S");
    expect(departureCountry).toBeInvalid();
    await user.clear(departureCountry);
    expect(departureCountry).toBeValid();

    const originTimezone = document.querySelector<HTMLInputElement>(
      'input[name="journey.0.originTimezone"]'
    );
    const destinationTimezone = document.querySelector<HTMLInputElement>(
      'input[name="journey.0.destinationTimezone"]'
    );
    expect(originTimezone).toHaveAttribute("required");
    expect(destinationTimezone).toHaveAttribute("required");
    expect(originTimezone).toHaveValue("");
    expect(destinationTimezone).toHaveValue("");

    await user.click(screen.getByRole("button", { name: "Origin time zone" }));
    await user.type(
      screen.getByRole("combobox", { name: "Search city or time zone" }),
      "Singapore"
    );
    await user.click(screen.getByRole("option", { name: /Singapore.*Asia\/Singapore/i }));
    await user.click(screen.getByRole("button", { name: "Destination time zone" }));
    await user.type(screen.getByRole("combobox", { name: "Search city or time zone" }), "Dubai");
    await user.click(screen.getByRole("option", { name: /Dubai.*Asia\/Dubai/i }));

    await user.type(screen.getByLabelText("Timeline title"), "International bus");
    await user.type(screen.getByLabelText("Boarding point"), "Bugis MRT Exit D");
    await user.type(screen.getByLabelText("Drop-off point"), "City terminal");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() =>
      expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "bus",
          journeyScope: "international",
          legs: [
            expect.objectContaining({
              originCountryCode: undefined,
              originTimezone: "Asia/Singapore",
              destinationCountryCode: undefined,
              destinationTimezone: "Asia/Dubai"
            })
          ]
        })
      )
    );
  });

  it("keeps a booked ferry focused on the route, travelers, contact, and main reference", async () => {
    const { user } = renderForm(travelers);
    await user.click(
      screen.getByRole("button", { name: /Ferry \/ boat Passenger or vehicle sailing/i })
    );
    expectOfficialDocumentPicker("journey_ticket");
    await user.type(screen.getByLabelText("Booking reference (optional)"), "ORDER-42");
    await user.click(screen.getByRole("radio", { name: /^Ticket booked/ }));
    expect(screen.getAllByLabelText("Booking reference (optional)")).toHaveLength(1);
    expect(screen.getByLabelText("Booking reference (optional)")).toHaveValue("ORDER-42");
    expect(screen.getByLabelText("Contact name (optional)")).toBeInTheDocument();
    expect(screen.getByLabelText("Booking reference (optional)")).not.toBeRequired();
    expect(screen.queryByText("Traveler ticket details")).not.toBeInTheDocument();
    expect(screen.queryByText("Ferry ticket and vehicle details")).not.toBeInTheDocument();
    expect(screen.queryByText("Boarding and platform details")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sailing direction")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ticket timing")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Seating")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Timeline title"), "Ferry to Batam");
    await user.type(screen.getByLabelText("Contact name (optional)"), "Shantanu Singh");
    await user.type(screen.getByLabelText("Operator or support phone (optional)"), "+6591234567");
    await user.type(screen.getByLabelText("Ferry operator"), "Batam Fast");
    await user.type(screen.getByLabelText("Departure terminal or pier"), "HarbourFront");
    await user.type(screen.getByLabelText("Arrival terminal or pier"), "Batam Centre");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() =>
      expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "ferry",
          referenceCode: "ORDER-42",
          contactName: "Shantanu Singh",
          contactPhone: "+6591234567",
          legs: [
            expect.objectContaining({
              details: { kind: "ferry" },
              travelerAllocations: []
            })
          ]
        })
      )
    );
  });

  it("finishes a booked ferry save with a clear confirmation warning when no reference was recorded", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Ferry \/ boat Passenger or vehicle sailing/i })
    );
    await user.click(screen.getByRole("radio", { name: /^Ticket booked/ }));
    await user.type(screen.getByLabelText("Timeline title"), "Ferry to Batam");
    await user.type(screen.getByLabelText("Ferry operator"), "Batam Fast");
    await user.type(screen.getByLabelText("Departure terminal or pier"), "HarbourFront");
    await user.type(screen.getByLabelText("Arrival terminal or pier"), "Batam Centre");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    const completion = await screen.findByRole("status");
    expect(completion).toHaveTextContent(
      /needs an official confirmation or ticket, or a booking reference/i
    );
    expect(screen.getByRole("heading", { name: "Ferry to Batam" })).toBeInTheDocument();
  });

  it("keeps the train name visible for a plan and reveals ticket-only vocabulary after booking", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Train Rail plan, ticket, or connection/i })
    );
    expectOfficialDocumentPicker("journey_ticket");
    expect(screen.getByText("train details", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText("Train name (optional)")).toHaveAttribute(
      "placeholder",
      "Enter the train name if it is already known"
    );
    expect(screen.queryByLabelText(/Booked from station/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Connecting trains" }));
    const origins = screen.getAllByLabelText("Boarding station");
    const destinations = screen.getAllByLabelText("Destination station");
    await user.type(origins[0], "New Delhi");
    await user.type(destinations[0], "Jaipur");
    expect(origins[1]).toHaveValue("Jaipur");
    expect(origins[1]).toHaveAttribute("readonly");
    await user.type(destinations[1], "Agra");
    expect(screen.getByText("Connection 1 · New Delhi → Jaipur")).toBeInTheDocument();
    expect(screen.getByText("Connection 2 · Jaipur → Agra")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /^Ticket booked/ }));
    expect(screen.getByLabelText("PNR or booking reference (optional)")).toBeInTheDocument();
    expect(screen.getAllByText("Train ticket details")).toHaveLength(2);
    await user.click(screen.getAllByText("Train ticket details")[0]);
    expect(screen.getAllByLabelText("Booked from station (optional)")[0]).toHaveAttribute(
      "placeholder",
      "Only add this if it differs from the boarding station"
    );
  });

  it("saves a known train name before the ticket is booked", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Train Rail plan, ticket, or connection/i })
    );
    await user.type(screen.getByLabelText("Timeline title"), "Train to Jaipur");
    await user.type(screen.getByLabelText("Train name (optional)"), "Ajmer Shatabdi");
    await user.type(screen.getByLabelText("Boarding station"), "New Delhi");
    await user.type(screen.getByLabelText("Destination station"), "Jaipur");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "train",
          reservationState: "planned",
          legs: [
            expect.objectContaining({
              details: expect.objectContaining({ kind: "train", train_name: "Ajmer Shatabdi" })
            })
          ]
        })
      )
    );
  });

  it("keeps cab free of flight-style scope, connection, platform, and seat fields", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Cab Local ride, transfer, or outstation/i })
    );
    expectOfficialDocumentPicker("journey_ticket");
    expect(screen.getByRole("radio", { name: "Local ride" })).toBeChecked();
    expect(screen.getByRole("radio", { name: /^Need a cab/ })).toBeChecked();
    expect(
      screen.queryByRole("radio", { name: /Domestic|International|Direct|Connecting/ })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Service number|Seat|Platform|Boarding lead/)
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByLabelText("Timing"))
        .getAllByRole("option")
        .map((option) => option.textContent)
    ).toEqual(["Exact date and time", "Before or after another event"]);
    expect(screen.getByLabelText("Pickup")).toBeInTheDocument();
    expect(screen.getByLabelText("Drop-off")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /^Booked in advance/ }));
    expect(screen.getByLabelText("Cab operator")).toBeInTheDocument();
    expect(screen.getByLabelText("Booking reference / Ride ID (optional)")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Timeline title"), "Hotel pickup");
    await user.type(screen.getByLabelText("Pickup"), "Airport terminal");
    await user.type(screen.getByLabelText("Drop-off"), "Hotel");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose the cab company or app");
    expect(mocks.addJourneyBooking).not.toHaveBeenCalled();
  });

  it("uses endpoint time zones instead of a duplicate event zone for a cross-border cab", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Cab Local ride, transfer, or outstation/i })
    );
    expect(screen.getByRole("button", { name: "Event time zone" })).toBeInTheDocument();
    await user.click(screen.getByText("More ride details"));
    await user.click(screen.getByLabelText("Cross-border ride"));
    expect(screen.queryByRole("button", { name: "Event time zone" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pickup time zone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drop-off time zone" })).toBeInTheDocument();
  });

  it("adds ordered optional stops and their costs to one cab journey", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Cab Local ride, transfer, or outstation/i })
    );
    await user.type(screen.getByLabelText("Timeline title"), "Cab for the day");
    await user.type(screen.getByLabelText("Pickup"), "Hotel");
    await user.type(screen.getByLabelText("Drop-off"), "Hotel");
    await user.click(screen.getByRole("button", { name: "Add stop" }));
    await user.type(screen.getByLabelText(/Stop name/), "Museum");
    await user.type(screen.getByLabelText("Place"), "National Museum");
    await user.type(screen.getByLabelText("Extra cost (optional)"), "500");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() =>
      expect(mocks.addCabStop).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: trip.id,
          journeyLegId: "journey-leg-1",
          stopOrder: 100,
          title: "Museum",
          location: "National Museum"
        })
      )
    );
    expect(mocks.saveOptionalCostForCreatedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        cabStopId: "cab-stop-1",
        title: "Museum cost",
        amountMinor: 50000,
        currencyCode: "INR"
      })
    );
  });

  it("links an airport-transfer cab using a readable flight picker", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Cab Local ride, transfer, or outstation/i })
    );
    await user.click(screen.getByRole("radio", { name: "Airport transfer" }));
    await user.click(screen.getByText("More ride details"));
    const flightOption = await screen.findByRole("option", {
      name: "Air India AI 909 · BLR → DXB"
    });
    expect(flightOption).toHaveValue(linkedFlight.id);
    await user.selectOptions(screen.getByLabelText("Linked flight (optional)"), linkedFlight.id);
    await user.type(screen.getByLabelText("Timeline title"), "Airport pickup");
    await user.type(screen.getByLabelText("Pickup"), "Dubai Airport");
    await user.type(screen.getByLabelText("Drop-off"), "Marina hotel");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "cab",
          legs: [
            expect.objectContaining({
              details: expect.objectContaining({
                kind: "cab",
                ride_type: "airport_transfer",
                linked_flight_leg_id: linkedFlight.id
              })
            })
          ]
        })
      )
    );
  });

  it("preserves a cab's relative placement and optional duration in its timeline item", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Cab Local ride, transfer, or outstation/i })
    );
    await user.type(screen.getByLabelText("Timeline title"), "Cab after checkout");
    await user.type(screen.getByLabelText("Pickup"), "Hotel");
    await user.type(screen.getByLabelText("Drop-off"), "Station");
    await user.selectOptions(screen.getByLabelText("Timing"), "relative");
    await user.selectOptions(screen.getByLabelText("Event"), anchor.id);
    await user.type(screen.getByLabelText("Duration (optional)"), "30");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() =>
      expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          itineraryTiming: expect.objectContaining({
            timingMode: "relative",
            anchorItineraryItemId: anchor.id,
            relativePosition: "after",
            hasExplicitStartTime: false,
            durationMinutes: 30
          })
        })
      )
    );
  });

  it("derives a booked meal party size from included travelers while keeping it editable", async () => {
    const { user } = renderForm([...travelers, secondTraveler]);
    await user.click(screen.getByRole("button", { name: /Meal Lunch, dinner, or reservation/i }));
    expectOfficialDocumentPicker("meal_voucher");
    await user.click(screen.getByRole("radio", { name: /^Reserved/ }));
    const partySize = screen.getByLabelText("Party size (optional)");
    await waitFor(() => expect(partySize).toHaveValue(2));
    await user.click(screen.getByRole("radio", { name: "Selected travelers" }));
    await user.click(screen.getByRole("checkbox", { name: "Shantanu" }));
    await waitFor(() => expect(partySize).toHaveValue(1));
    await user.clear(partySize);
    await user.type(partySize, "5");
    await user.type(screen.getByLabelText("Meal or restaurant name"), "Dinner at Candlenut");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addBookedTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "restaurant",
          bookingDetails: expect.objectContaining({ party_size: 5 })
        })
      )
    );
  });

  it("persists optional preparation place, navigation, provider, and manage link in supported structured fields", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Planning Plan the day, tasks, or things to arrange/i })
    );
    expectOfficialDocumentPicker("other");
    await user.type(screen.getByLabelText("Plan or task"), "Collect visas");
    await user.click(screen.getByText("More details"));
    await user.type(screen.getByLabelText("Place (optional)"), "Visa centre");
    await user.type(
      screen.getByLabelText("Navigation (Google Maps link, optional)"),
      "https://maps.google.com/visa-centre"
    );
    await user.type(screen.getByLabelText("Provider or organization (optional)"), "VFS Global");
    await user.type(
      screen.getByLabelText("External booking or manage link (optional)"),
      "https://example.com/manage-appointment"
    );
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addBookedTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "preparation",
          type: "other",
          reservationState: "planned",
          provider: "VFS Global",
          location: "Visa centre",
          mapUrl: "https://maps.google.com/visa-centre",
          bookedViaUrl: "https://example.com/manage-appointment"
        })
      )
    );
  });

  it("keeps preparation saved and reports a non-blocking warning when its optional cost fails", async () => {
    mocks.saveOptionalCostForCreatedEvent.mockResolvedValue(
      "The event is saved, but its cost could not be added. Add the cost from this event later."
    );
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Planning Plan the day, tasks, or things to arrange/i })
    );
    await user.type(screen.getByLabelText("Plan or task"), "Visa appointment");
    await user.click(screen.getByText("More details"));
    await user.type(screen.getByLabelText("Provider or organization (optional)"), "VFS Global");
    await user.click(screen.getByText("Cost"));
    expect(
      screen.queryByRole("radio", { name: /Add later|Free|Add amount/ })
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Amount (optional)"), "2500");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    expect(await screen.findByRole("heading", { name: "Visa appointment" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      /event is saved, but its cost could not be added/i
    );
    expect(mocks.addBookedTimelineEvent).toHaveBeenCalledTimes(1);
    expect(mocks.saveOptionalCostForCreatedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingId: "booking-1",
        itineraryItemId: "item-1",
        amountMinor: 250000
      })
    );
  });

  it("keeps an event cost optional and hides traveler splitting while the trip setting is off", async () => {
    const { user } = renderForm([travelers[0], secondTraveler], {
      ...trip,
      expense_splitting_enabled: false
    });
    await user.click(
      screen.getByRole("button", { name: /Activity Visit, tour, ticket, or free time/i })
    );
    await user.click(screen.getByText("Cost"));

    expect(
      screen.getByText(/leave it blank and add the cost from the event later/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Amount (optional)")).not.toBeRequired();
    await user.click(screen.getByText("Payment and sharing (optional)"));
    expect(
      screen.queryByRole("radio", { name: "Split among event travelers" })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Choose people" })).not.toBeInTheDocument();
  });

  it.each([false, true])(
    "keeps an event cost with its two selected travelers (splitting enabled: %s)",
    async (enabled) => {
      const thirdTraveler = { ...secondTraveler, id: "traveler-3", display_name: "Third traveler" };
      const { user } = renderForm([...travelers, secondTraveler, thirdTraveler], {
        ...trip,
        expense_splitting_enabled: enabled
      });
      await user.click(
        screen.getByRole("button", { name: /Activity Visit, tour, ticket, or free time/i })
      );
      await user.type(screen.getByLabelText("Activity name"), "Two-person visit");
      await user.click(screen.getByRole("radio", { name: "Selected travelers" }));
      await user.click(screen.getByRole("checkbox", { name: "Shantanu" }));
      await user.click(screen.getByRole("checkbox", { name: "Mira" }));
      await user.click(screen.getByText("Cost"));
      await user.type(screen.getByLabelText("Amount (optional)"), "3000");
      await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
      await waitFor(() =>
        expect(mocks.saveOptionalCostForCreatedEvent).toHaveBeenCalledWith(
          expect.objectContaining({
            amountMinor: 300000,
            participantTravelerIds: ["traveler-1", "traveler-2"]
          })
        )
      );
      expect(mocks.addItineraryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          travelerIds: ["traveler-1", "traveler-2"]
        })
      );
    }
  );

  it("shows traveler split choices in an event cost only when the trip setting is on", async () => {
    const { user } = renderForm([travelers[0], secondTraveler], {
      ...trip,
      expense_splitting_enabled: true
    });
    await user.click(
      screen.getByRole("button", { name: /Activity Visit, tour, ticket, or free time/i })
    );
    await user.click(screen.getByText("Cost"));
    await user.click(screen.getByText("Payment and sharing (optional)"));

    expect(screen.getByRole("radio", { name: "Split among event travelers" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Choose people" })).toBeInTheDocument();
  });

  it("keeps a relative activity duration and only exposes booking fields after Booked is selected", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Activity Visit, tour, ticket, or free time/i })
    );
    expect(screen.queryByLabelText(/Booking reference/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Activity name"), "Museum visit");
    await user.selectOptions(screen.getByLabelText("Timing"), "relative");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: anchor.title })).toBeInTheDocument()
    );
    await user.selectOptions(screen.getByLabelText("Event"), anchor.id);
    await user.type(screen.getByLabelText("Duration (optional)"), "90");
    await user.click(screen.getByRole("radio", { name: /^Booked/ }));
    expect(screen.getByLabelText("Booking reference (optional)")).toBeInTheDocument();
    const bookingDetails = screen.getByText("Booking details").closest("details");
    const moreDetails = screen.getByText("More details").closest("details");
    expect(bookingDetails).toHaveAttribute("open");
    expect(
      bookingDetails!.compareDocumentPosition(moreDetails!) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addBookedTimelineEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "activity",
          title: "Museum visit",
          timingMode: "relative",
          anchorItineraryItemId: anchor.id,
          relativePosition: "after",
          hasExplicitStartTime: false,
          durationMinutes: 90,
          reservationState: "booked"
        })
      )
    );
  });

  it("keeps useful activity instructions when the booking will be added later", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Activity Visit, tour, ticket, or free time/i })
    );
    await user.type(screen.getByLabelText("Activity name"), "Street-art walk");
    await user.click(screen.getByText("More details"));
    await user.type(
      screen.getByLabelText("Entry or meeting instructions (optional)"),
      "Meet outside the east gate"
    );
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() =>
      expect(mocks.addItineraryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Street-art walk",
          notes: "Entry / meeting: Meet outside the east gate"
        })
      )
    );
  });

  it("adapts Other transport to its subtype and keeps Walk free of booking fields", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Other transport Metro, rental, transfer, or walk/i })
    );
    expectOfficialDocumentPicker("journey_ticket");
    await user.selectOptions(screen.getByLabelText("Transport type"), "walk");
    expect(screen.queryByRole("group", { name: "Booking status" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Booking reference/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Timeline title"), "Walk to the museum");
    await user.type(screen.getByLabelText("From"), "Hotel");
    await user.type(screen.getByLabelText("To"), "Museum");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addItineraryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: "transport",
          title: "Walk to the museum",
          location: "Hotel → Museum",
          notes: "Walk"
        })
      )
    );
  });

  it("marks the explicit Already took this ride cab state as done", async () => {
    const { user } = renderForm();
    await user.click(
      screen.getByRole("button", { name: /Cab Local ride, transfer, or outstation/i })
    );
    await user.click(screen.getByRole("radio", { name: /^Already took this ride/ }));
    await user.type(screen.getByLabelText("Timeline title"), "Airport taxi");
    await user.type(screen.getByLabelText("Pickup"), "Terminal 3");
    await user.type(screen.getByLabelText("Drop-off"), "Hotel");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));
    await waitFor(() =>
      expect(mocks.addJourneyBooking).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "cab", reservationState: "walk_up" })
      )
    );
    expect(mocks.setItineraryItemStatus).toHaveBeenCalledWith(
      expect.objectContaining({ id: "item-1" }),
      "done"
    );
  });
});
