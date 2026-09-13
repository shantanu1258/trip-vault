import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip } from "../trips/types";
import type { Booking, Traveler } from "./types";

const mocks = vi.hoisted(() => ({
  addBooking: vi.fn(),
  archiveBooking: vi.fn(),
  linkBookingToItineraryItem: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../metadata/VendorPicker", () => ({ VendorPicker: ({ name = "bookedViaName" }: { name?: string }) => <input aria-label="Booked via selection" name={name} /> }));
vi.mock("../trips/api", () => ({ linkBookingToItineraryItem: mocks.linkBookingToItineraryItem }));
vi.mock("./api", () => ({ addBooking: mocks.addBooking, archiveBooking: mocks.archiveBooking }));

import { AddActivityBookingForm } from "./AddActivityBookingForm";

const trip: Trip = {
  id: "trip-1",
  title: "Dubai trip",
  destination_summary: "Dubai",
  start_date: "2026-09-26",
  end_date: "2026-10-02",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const item: ItineraryItem = {
  id: "activity-1",
  trip_id: trip.id,
  booking_id: null,
  title: "Museum of the Future",
  event_type: "activity",
  starts_at: "2026-09-28T04:00:00.000Z",
  ends_at: "2026-09-28T06:00:00.000Z",
  timezone: "Asia/Dubai",
  location: { label: "Museum of the Future", map_url: "https://maps.example/museum" },
  notes: "Arrive early",
  applies_to_all_travelers: false,
  timing_mode: "exact",
  event_status: "planned",
  sort_key: "one",
  version: 7,
  created_at: "2026-09-01T00:00:00.000Z"
};

const travelers: Traveler[] = [
  { id: "asha", trip_id: trip.id, display_name: "Asha", is_minor: false, created_at: "" },
  { id: "ravi", trip_id: trip.id, display_name: "Ravi", is_minor: false, created_at: "" }
];

const booking: Booking = {
  id: "booking-1",
  trip_id: trip.id,
  type: "activity",
  title: item.title,
  provider: "Museum box office",
  reference_code: "MUSEUM-42",
  start_at: item.starts_at,
  end_at: item.ends_at,
  source_timezone: item.timezone,
  location: { label: "Museum of the Future" },
  details: {},
  created_at: "2026-09-01T00:00:00.000Z"
};

function renderForm(onClose = vi.fn(), activity = item) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={queryClient}><AddActivityBookingForm trip={trip} item={activity} travelers={travelers} eventTravelerIds={["asha"]} onClose={onClose} /></QueryClientProvider></MemoryRouter>);
  return onClose;
}

describe("Add activity booking details", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.addBooking.mockResolvedValue(booking);
    mocks.linkBookingToItineraryItem.mockResolvedValue({ ...item, booking_id: booking.id });
    mocks.archiveBooking.mockResolvedValue(undefined);
  });

  it("reuses the event plan, defaults its travelers, and links the new booking", async () => {
    const user = userEvent.setup();
    const onClose = renderForm();
    await user.type(screen.getByLabelText("Activity provider (optional)"), "Museum box office");
    await user.type(screen.getByLabelText("Booking reference (optional)"), "MUSEUM-42");
    await user.type(screen.getByLabelText("Booked via selection"), "Direct");
    await user.type(screen.getByLabelText("Booking website (optional)"), "https://museum.example/manage");
    await user.click(screen.getByRole("button", { name: "Save booking details" }));

    await waitFor(() => expect(mocks.addBooking).toHaveBeenCalledWith(expect.objectContaining({
      tripId: trip.id,
      type: "activity",
      title: item.title,
      provider: "Museum box office",
      referenceCode: "MUSEUM-42",
      startsAt: item.starts_at,
      endsAt: item.ends_at,
      timezone: item.timezone,
      location: "Museum of the Future",
      bookedViaName: "Direct",
      bookedViaUrl: "https://museum.example/manage",
      travelerIds: ["asha"]
    })));
    expect(mocks.linkBookingToItineraryItem).toHaveBeenCalledWith(item, booking.id);
    expect(mocks.archiveBooking).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("archives the new booking if attaching it fails", async () => {
    const user = userEvent.setup();
    const onClose = renderForm();
    mocks.linkBookingToItineraryItem.mockRejectedValueOnce(new Error("Activity changed on another device"));
    await user.click(screen.getByRole("button", { name: "Save booking details" }));

    await waitFor(() => expect(mocks.archiveBooking).toHaveBeenCalledWith(booking));
    expect(await screen.findByRole("alert")).toHaveTextContent("Activity changed on another device");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not create a booking from a flexible activity's synthetic instant", () => {
    renderForm(vi.fn(), { ...item, timing_mode: "date_only" });

    expect(screen.getByText("Set an exact activity time first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save booking details" })).not.toBeInTheDocument();
    expect(mocks.addBooking).not.toHaveBeenCalled();
  });
});
