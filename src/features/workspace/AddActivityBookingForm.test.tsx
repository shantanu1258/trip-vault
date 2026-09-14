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

import { AddActivityBookingForm, canAddEventBooking } from "./AddActivityBookingForm";

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

function renderForm(onClose = vi.fn(), activity = item, itinerary: ItineraryItem[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  render(<MemoryRouter><QueryClientProvider client={queryClient}><AddActivityBookingForm trip={trip} item={activity} itinerary={itinerary} travelers={travelers} eventTravelerIds={["asha"]} onClose={onClose} /></QueryClientProvider></MemoryRouter>);
  return onClose;
}

describe("Add booking details to an existing event", () => {
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
    await user.type(screen.getByLabelText("Entry or meeting instructions (optional)"), "Use the north entrance");
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
      bookingDetails: { meeting_instructions: "Use the north entrance" },
      reservationState: "booked",
      participantScope: "selected",
      travelerIds: ["asha"]
    })));
    expect(mocks.linkBookingToItineraryItem).toHaveBeenCalledWith(item, booking.id, { participantScope: "selected", travelerIds: ["asha"] });
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

  it("creates an untimed restaurant booking for a relative meal and links only the existing event", async () => {
    const user = userEvent.setup();
    const anchor = { ...item, id: "hotel-1", title: "Marina hotel check-in" };
    const relativeMeal = {
      ...item,
      id: "meal-1",
      title: "Dinner at the marina",
      event_type: "meal" as const,
      timing_mode: "relative" as const,
      anchor_itinerary_item_id: "hotel-1",
      relative_position: "after" as const,
      has_explicit_start_time: false
    };
    mocks.linkBookingToItineraryItem.mockResolvedValueOnce({ ...relativeMeal, booking_id: booking.id });
    renderForm(vi.fn(), relativeMeal, [anchor, relativeMeal]);

    expect(screen.getByText(/After Marina hotel check-in/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Restaurant or venue (optional)"), "Marina Kitchen");
    expect(screen.getByLabelText("Party size (optional)")).toHaveValue(1);
    await user.type(screen.getByLabelText("Dietary or arrival notes (optional)"), "Window table");
    await user.click(screen.getByRole("button", { name: "Save booking details" }));

    await waitFor(() => expect(mocks.addBooking).toHaveBeenCalledWith(expect.objectContaining({
      tripId: trip.id,
      type: "restaurant",
      title: relativeMeal.title,
      provider: "Marina Kitchen",
      startsAt: undefined,
      endsAt: undefined,
      timezone: undefined,
      bookingDetails: { party_size: 1, dietary_notes: "Window table" },
      reservationState: "booked",
      participantScope: "selected",
      travelerIds: ["asha"]
    })));
    expect(mocks.addBooking).toHaveBeenCalledOnce();
    expect(mocks.linkBookingToItineraryItem).toHaveBeenCalledOnce();
    expect(mocks.linkBookingToItineraryItem).toHaveBeenCalledWith(relativeMeal, booking.id, { participantScope: "selected", travelerIds: ["asha"] });
    expect(screen.getByText("The booking will stay untimed while this event has no explicit start time.")).toBeInTheDocument();
  });

  it("captures transport-specific booking details when a planned transfer is booked later", async () => {
    const user = userEvent.setup();
    const transfer = { ...item, id: "transfer-1", event_type: "transport" as const, title: "Hotel transfer" };
    renderForm(vi.fn(), transfer);

    await user.selectOptions(screen.getByLabelText("Transport type (optional)"), "private_transfer");
    await user.type(screen.getByLabelText("Return date and time (optional)"), "2026-09-30T18:30");
    await user.click(screen.getByRole("button", { name: "Save booking details" }));

    await waitFor(() => expect(mocks.addBooking).toHaveBeenCalledWith(expect.objectContaining({
      type: "transport",
      bookingDetails: { transport_subtype: "private_transfer", transport_return_at: "2026-09-30T18:30" }
    })));
  });

  it("keeps an Everyone event canonical when adding its booking later", async () => {
    const user = userEvent.setup();
    renderForm(vi.fn(), { ...item, applies_to_all_travelers: true }, []);

    expect(screen.getByRole("radio", { name: "Everyone" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save booking details" }));

    await waitFor(() => expect(mocks.addBooking).toHaveBeenCalledWith(expect.objectContaining({
      participantScope: "everyone",
      reservationState: "booked",
      travelerIds: []
    })));
  });

  it("supports every flexible timing mode and all generic event types", () => {
    for (const eventType of ["activity", "meal", "transport", "preparation", "custom"] as const) {
      for (const timingMode of ["exact", "date_only", "all_day", "relative", "unscheduled"] as const) {
        expect(canAddEventBooking({ ...item, event_type: eventType, timing_mode: timingMode })).toBe(true);
      }
    }
    expect(canAddEventBooking({ ...item, booking_id: "booking-1" })).toBe(false);
    expect(canAddEventBooking({ ...item, event_type: "flight" })).toBe(false);
  });
});
