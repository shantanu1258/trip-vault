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
vi.mock("../metadata/AirlinePicker", () => ({ AirlinePicker: ({ name }: { name: string }) => <input name={name} /> }));
vi.mock("../metadata/AirportPicker", () => ({ AirportPicker: ({ name }: { name: string }) => <input name={name} /> }));
vi.mock("../metadata/VendorPicker", () => ({ VendorPicker: () => <input name="bookedViaName" /> }));
vi.mock("../workspace/ParticipantSelector", () => ({ ParticipantSelector: () => null }));
vi.mock("../trips/api", () => ({ addItineraryItem: mocks.addItineraryItem, addTripCost: mocks.addTripCost }));
vi.mock("../workspace/api", () => ({
  addBookedTimelineEvent: mocks.addBookedTimelineEvent,
  addFlightBooking: mocks.addFlightBooking,
  addJourneyBooking: mocks.addJourneyBooking,
  suggestCatalogValue: mocks.suggestCatalogValue
}));

import { AddEventForm } from "./AddEventForm";

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

    await user.type(screen.getByLabelText("Event title"), "Marina hotel");
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
    await user.type(screen.getByLabelText("Event title"), "Marina hotel");
    await user.type(screen.getByLabelText("Place / address"), "Marina Bay, Singapore");
    await user.type(screen.getByLabelText("Google Maps link"), "https://maps.google.com/hotel");
    await user.type(screen.getByLabelText("Notes"), "Late arrival");
    await user.type(screen.getByLabelText("Provider / operator"), "Harbour Hotel");
    await user.type(screen.getByLabelText(/Reference \/ PNR/), "STAY123");
    await user.type(screen.getByLabelText("Booked via"), "Booking.example");
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
      provider: "Harbour Hotel",
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
        paymentStatus: "paid"
      }
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
