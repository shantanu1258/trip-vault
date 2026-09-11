import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
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

describe("Add Event hotel stay", () => {
  it("keeps checkout after check-in and submits the converted stay range", async () => {
    mocks.addBookedTimelineEvent.mockResolvedValue({ booking: { id: "booking-1" }, itinerary: [] });
    mocks.suggestCatalogValue.mockResolvedValue(undefined);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<QueryClientProvider client={queryClient}><AddEventForm trip={trip} travelers={[]} onClose={onClose} /></QueryClientProvider>);

    await user.click(screen.getByRole("button", { name: /Hotel Creates check-in and checkout/i }));
    const checkIn = screen.getByLabelText("Check-in (hotel local time)");
    const checkout = screen.getByLabelText("Checkout (hotel local time)");
    expect(checkIn).toHaveValue("2026-09-26T15:00");
    expect(checkout).toHaveValue("2026-09-27T11:00");

    fireEvent.change(checkIn, { target: { value: "2026-10-11T15:00" } });
    expect(checkout).toHaveValue("2026-10-12T11:00");
    fireEvent.change(checkout, { target: { value: "2026-10-12T18:00" } });
    await user.type(screen.getByLabelText("Event title"), "Marina hotel");
    await user.click(screen.getByRole("button", { name: /Save to timeline/i }));

    await waitFor(() => expect(mocks.addBookedTimelineEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: "hotel",
      title: "Marina hotel",
      startsAt: "2026-10-11T09:30:00.000Z",
      endsAt: "2026-10-12T12:30:00.000Z",
      timezone: "Asia/Kolkata"
    })));
    expect(onClose).toHaveBeenCalled();
  });
});
