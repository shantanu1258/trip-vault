import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../trips/types";

const mocks = vi.hoisted(() => ({
  addBookedTimelineEvent: vi.fn(),
  addFlightBooking: vi.fn(),
  addItineraryItem: vi.fn(),
  addJourneyBooking: vi.fn(),
  addTripCost: vi.fn(),
  suggestCatalogValue: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../metadata/AirlinePicker", () => ({ AirlinePicker: ({ name }: { name: string }) => <><input name={name} /><input name={`${name}Source`} value="catalog" readOnly /></> }));
vi.mock("../metadata/AirportPicker", () => ({ AirportPicker: ({ name, codeName, timezoneName, countryName, label }: { name: string; codeName: string; timezoneName: string; countryName: string; label: string }) => <><input aria-label={label} name={name} /><input name={codeName} value={label === "From airport" ? "BLR" : "DXB"} readOnly /><input name={timezoneName} value={label === "From airport" ? "Asia/Kolkata" : "Asia/Dubai"} readOnly /><input name={countryName} value={label === "From airport" ? "IN" : "AE"} readOnly /><input name={`${name}Source`} value="catalog" readOnly /></> }));
vi.mock("../metadata/VendorPicker", () => ({ VendorPicker: () => <><input name="bookedViaName" /><input name="bookedViaNameSource" value="catalog" readOnly /></> }));
vi.mock("../workspace/ParticipantSelector", () => ({ ParticipantSelector: () => null }));
vi.mock("../trips/api", () => ({ addItineraryItem: mocks.addItineraryItem, addTripCost: mocks.addTripCost }));
vi.mock("../workspace/api", () => ({
  addBookedTimelineEvent: mocks.addBookedTimelineEvent,
  addFlightBooking: mocks.addFlightBooking,
  addJourneyBooking: mocks.addJourneyBooking,
  suggestCatalogValue: mocks.suggestCatalogValue
}));

import { AddEventForm, assertSequentialConnectionTimes } from "./AddEventForm";

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

function renderAddEvent() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(<QueryClientProvider client={queryClient}><AddEventForm trip={trip} travelers={[]} onClose={onClose} /></QueryClientProvider>);
  return { onClose, user };
}

async function openHotel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Hotel Creates check-in and checkout/i }));
  return {
    checkIn: screen.getByLabelText("Check-in (hotel local time)"),
    checkout: screen.getByLabelText("Checkout (hotel local time)")
  };
}

describe("Add Event hotel stay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addBookedTimelineEvent.mockResolvedValue({ booking: { id: "booking-1" }, itinerary: [] });
    mocks.suggestCatalogValue.mockResolvedValue(undefined);
  });

  it("starts with a safe overnight stay and preserves a deliberate valid checkout", async () => {
    const { user } = renderAddEvent();
    const { checkIn, checkout } = await openHotel(user);

    expect(screen.getByLabelText("Hotel / property name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Hotel time zone")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Service provider/)).not.toBeInTheDocument();
    expect(screen.queryByText(/clock repeats/i)).not.toBeInTheDocument();
    expect(checkIn).toHaveValue("2026-09-26T15:00");
    expect(checkout).toHaveValue("2026-09-27T11:00");

    fireEvent.change(checkout, { target: { value: "2026-10-12T18:00" } });
    fireEvent.change(checkIn, { target: { value: "2026-10-11T15:00" } });
    expect(checkout).toHaveValue("2026-10-12T18:00");

    fireEvent.change(checkIn, { target: { value: "2026-10-13T15:00" } });
    expect(checkout).toHaveValue("2026-10-14T11:00");

    fireEvent.change(checkout, { target: { value: "" } });
    fireEvent.change(checkIn, { target: { value: "2026-10-20T15:00" } });
    expect(checkout).toHaveValue("2026-10-21T11:00");
  });

  it.each([
    ["the same instant", "2026-10-11T15:00"],
    ["an earlier instant", "2026-10-11T14:00"]
  ])("blocks %s without writing, then lets the traveler correct and save", async (_case, invalidCheckout) => {
    const { onClose, user } = renderAddEvent();
    const { checkIn, checkout } = await openHotel(user);

    await user.type(screen.getByLabelText("Hotel / property name"), "Marina hotel");
    fireEvent.change(checkIn, { target: { value: "2026-10-11T15:00" } });
    fireEvent.change(checkout, { target: { value: invalidCheckout } });
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Hotel checkout date and time must be after check-in.");
    expect(mocks.addBookedTimelineEvent).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.change(checkout, { target: { value: "2026-10-11T16:00" } });
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() => expect(mocks.addBookedTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      startsAt: "2026-10-11T09:30:00.000Z",
      endsAt: "2026-10-11T10:30:00.000Z"
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("submits the complete booking, local times, links, contact, and selected cost currency", async () => {
    const { onClose, user } = renderAddEvent();
    const { checkIn, checkout } = await openHotel(user);

    expect(checkout).toHaveValue("2026-09-27T11:00");
    fireEvent.change(checkIn, { target: { value: "2026-10-11T15:00" } });
    expect(checkout).toHaveValue("2026-10-12T11:00");
    fireEvent.change(checkout, { target: { value: "2026-10-12T18:00" } });
    await user.type(screen.getByLabelText("Hotel / property name"), "Marina hotel");
    await user.type(screen.getByLabelText("Place / address"), "Marina Bay, Singapore");
    await user.type(screen.getByLabelText("Google Maps link"), "https://maps.google.com/hotel");
    await user.type(screen.getByLabelText("Notes"), "Late arrival");
    await user.type(screen.getByLabelText(/^Booking reference$/), "STAY123");
    await user.type(screen.getByLabelText(/^Booked via/), "Booking.example");
    await user.type(screen.getByLabelText("Booking website"), "https://booking.example/stay");
    await user.type(screen.getByLabelText("Contact name"), "Front desk");
    await user.type(screen.getByLabelText("Phone number"), "+65 6123 4567");
    await user.click(screen.getByRole("checkbox", { name: "Add cost" }));
    await user.type(screen.getByLabelText("Amount"), "123.45");
    await user.selectOptions(screen.getByLabelText("Currency"), "SGD");
    await user.type(screen.getByLabelText("Cost label"), "Hotel stay");
    await user.selectOptions(screen.getByLabelText("Payment"), "paid");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() => expect(mocks.addBookedTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      tripId: "trip-1",
      type: "hotel",
      eventType: "hotel_check_in",
      title: "Marina hotel",
      startsAt: "2026-10-11T09:30:00.000Z",
      endsAt: "2026-10-12T12:30:00.000Z",
      timezone: "Asia/Kolkata",
      location: "Marina Bay, Singapore",
      mapUrl: "https://maps.google.com/hotel",
      notes: "Late arrival",
      provider: "Marina hotel",
      referenceCode: "STAY123",
      bookedViaName: "Booking.example",
      bookedViaUrl: "https://booking.example/stay",
      contactName: "Front desk",
      contactPhone: "+65 6123 4567",
      travelerIds: [],
      cost: {
        title: "Hotel stay",
        amountMinor: 12_345,
        currencyCode: "SGD",
        paymentStatus: "paid",
        paidByTravelerId: undefined,
        participantTravelerIds: []
      }
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("Add Event flight flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addFlightBooking.mockResolvedValue({ booking: { id: "booking-1" }, flights: [], itinerary: {} });
  });

  it("uses airline and airport choices, omits a redundant provider, and calculates boarding from the lead", async () => {
    const { user } = renderAddEvent();
    await user.click(screen.getByRole("button", { name: /Flight One or more connected legs/i }));
    expect(screen.getByRole("radio", { name: "Direct" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Add connecting flight" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^Service provider/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Contact name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Place / address")).not.toBeInTheDocument();
    expect(screen.queryByText(/clock repeats/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "International" }));
    expect(screen.getAllByLabelText("Repeated clock time choice")).toHaveLength(3);

    await user.type(screen.getByLabelText("Event title"), "Flight to Dubai");
    await user.type(screen.getByLabelText(/Booking reference \/ PNR/), "PNR123");
    await user.type(screen.getByLabelText(/^Airline/), "Air India");
    await user.type(screen.getByLabelText("Flight number"), "AI 909");
    await user.type(screen.getByLabelText("From airport"), "Kempegowda International Airport");
    await user.type(screen.getByLabelText("To airport"), "Dubai International Airport");
    await user.type(screen.getByLabelText("Boarding lead (minutes)"), "45");

    expect(screen.getByText(/Calculated boarding time: 2026-09-26 08:15/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() => expect(mocks.addFlightBooking).toHaveBeenCalledWith(expect.objectContaining({
      tripId: "trip-1",
      title: "Flight to Dubai",
      referenceCode: "PNR123",
      legs: [expect.objectContaining({
        airlineName: "Air India",
        flightNumber: "AI 909",
        departureCode: "BLR",
        departureName: "Kempegowda International Airport",
        departureTimezone: "Asia/Kolkata",
        arrivalCode: "DXB",
        arrivalName: "Dubai International Airport",
        arrivalTimezone: "Asia/Dubai",
        boardingLeadMinutes: 45
      })]
    })));
    expect(mocks.suggestCatalogValue).not.toHaveBeenCalled();
  });

  it("asks whether a route is direct or connecting and keeps at least two connecting legs", async () => {
    const { user } = renderAddEvent();
    await user.click(screen.getByRole("button", { name: /Flight One or more connected legs/i }));

    expect(screen.getAllByLabelText("Flight number")).toHaveLength(1);
    await user.click(screen.getByRole("radio", { name: "Connecting" }));
    expect(screen.getAllByLabelText("Flight number")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Remove flight leg/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add connecting flight" }));
    expect(screen.getAllByLabelText("Flight number")).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /Remove flight leg/i })).toHaveLength(3);

    await user.click(screen.getByRole("radio", { name: "Direct" }));
    expect(screen.getAllByLabelText("Flight number")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Add connecting flight" })).not.toBeInTheDocument();
  });

  it("requires every connection to leave strictly after the prior arrival", () => {
    expect(() => assertSequentialConnectionTimes([
      { departureAt: "2026-09-26T02:00:00.000Z", arrivalAt: "2026-09-26T05:00:00.000Z" },
      { departureAt: "2026-09-26T05:00:00.000Z", arrivalAt: "2026-09-26T08:00:00.000Z" }
    ], "flight")).toThrow("Connection 2 must depart after the previous flight arrives.");
  });

  it("rejects a connecting flight whose next leg starts at a different airport", async () => {
    const { user } = renderAddEvent();
    await user.click(screen.getByRole("button", { name: /Flight One or more connected legs/i }));
    await user.click(screen.getByRole("radio", { name: "International" }));
    await user.click(screen.getByRole("radio", { name: "Connecting" }));
    await user.type(screen.getByLabelText("Event title"), "Flight to Dubai");
    await user.type(screen.getByLabelText(/Booking reference \/ PNR/), "PNR123");
    for (const airline of screen.getAllByLabelText(/^Airline/)) await user.type(airline, "Air India");
    for (const number of screen.getAllByLabelText("Flight number")) await user.type(number, "AI 909");
    for (const airport of screen.getAllByLabelText("From airport")) await user.type(airport, "Bengaluru");
    for (const airport of screen.getAllByLabelText("To airport")) await user.type(airport, "Dubai");

    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Connection 2 must depart from where the previous flight arrives.");
    expect(mocks.addFlightBooking).not.toHaveBeenCalled();
  });

  it("puts the most-used event types first and hides local-only time-zone controls", async () => {
    const { user } = renderAddEvent();
    const labels = screen.getAllByRole("button").map((button) => button.textContent?.replace(/\s+/g, " ").trim());
    expect(labels.slice(0, 4)).toEqual([
      "FlightOne or more connected legs",
      "HotelCreates check-in and checkout",
      "ActivityVisit, tour, or free time",
      "BusCoach or local bus"
    ]);

    await user.click(screen.getByRole("button", { name: /Activity Visit, tour, or free time/i }));
    expect(screen.queryByLabelText("Place time zone")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Repeated clock time")).not.toBeInTheDocument();
  });

  it("hides contact names and time zones for domestic trains while preserving booking phone support", async () => {
    const { user } = renderAddEvent();
    await user.click(screen.getByRole("button", { name: /Train Rail ticket or connection/i }));

    expect(screen.queryByLabelText("Contact name")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Phone number")).toBeInTheDocument();
    expect(screen.queryByLabelText("Origin time zone")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Destination time zone")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Journey country")).toBeRequired();
    expect(screen.queryByLabelText("Origin country")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Destination country")).not.toBeInTheDocument();
    expect(screen.queryByText(/clock repeats/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Place / address")).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "International" }));
    expect(screen.queryByLabelText("Journey country")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Origin country")).toBeRequired();
    expect(screen.getByLabelText("Destination country")).toBeRequired();
    expect(screen.getByRole("button", { name: "Origin time zone" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Destination time zone" })).toBeInTheDocument();
  });
});
