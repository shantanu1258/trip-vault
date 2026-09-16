import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../trips/types";
import type { Booking, JourneyLeg } from "./types";

const mocks = vi.hoisted(() => ({
  onClose: vi.fn(),
  suggestCatalogValue: vi.fn().mockResolvedValue(undefined),
  updateJourneyLeg: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({
  ModalSheet: ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section aria-label={title}>{children}</section>
  )
}));
vi.mock("../../components/TimeZoneAutocomplete", () => ({
  TimeZoneAutocomplete: ({ name, defaultValue }: { name: string; defaultValue?: string }) => (
    <input aria-label={name} name={name} defaultValue={defaultValue} />
  )
}));
vi.mock("../metadata/JourneyOperatorPicker", () => ({
  JourneyOperatorPicker: ({ name, defaultValue }: { name: string; defaultValue?: string }) => (
    <>
      <input aria-label={name} name={name} defaultValue={defaultValue} />
      <input type="hidden" name={`${name}Source`} value="catalog" />
    </>
  )
}));
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    suggestCatalogValue: mocks.suggestCatalogValue,
    updateJourneyLeg: mocks.updateJourneyLeg
  };
});

import { EditJourneyLegForm } from "./EditJourneyLegForm";

const trip: Trip = {
  id: "trip-1",
  title: "Malaysia",
  destination_summary: "Kuala Lumpur",
  start_date: "2026-09-28",
  end_date: "2026-10-10",
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
  title: "Bus to Mysuru",
  provider: "KSRTC",
  reference_code: null,
  start_at: "2026-09-28T03:30:00.000Z",
  end_at: null,
  source_timezone: "Asia/Kolkata",
  location: null,
  details: {},
  reservation_state: "planned",
  participant_scope: "everyone",
  journey_scope: "domestic",
  created_at: "2026-09-01T00:00:00.000Z"
};

const leg: JourneyLeg = {
  id: "leg-1",
  booking_id: booking.id,
  segment_order: 0,
  mode: "bus",
  operator_name: "KSRTC",
  service_number: null,
  origin_code: "BLR",
  origin_name: "Bengaluru",
  origin_country_code: null,
  origin_timezone: "Asia/Kolkata",
  destination_code: "MYS",
  destination_name: "Mysuru",
  destination_country_code: null,
  destination_timezone: "Asia/Kolkata",
  scheduled_departure_at: "2026-09-28T03:30:00.000Z",
  scheduled_arrival_at: null,
  boarding_at: null,
  boarding_lead_minutes: 30,
  departure_platform: "4",
  arrival_platform: null,
  coach_or_cabin: null,
  seat: null,
  details: { kind: "bus", bus_class_or_layout: "Volvo", shared_ticket_number: "BUS-42" },
  status_note: null,
  version: 3
};

function renderForm(currentBooking = booking, currentLeg = leg) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return {
    user: userEvent.setup(),
    ...render(
      <QueryClientProvider client={client}>
        <EditJourneyLegForm
          trip={trip}
          booking={currentBooking}
          leg={currentLeg}
          legNumber={1}
          onClose={mocks.onClose}
        />
      </QueryClientProvider>
    )
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.updateJourneyLeg.mockResolvedValue({ leg, booking, itinerary: [] });
});

describe("journey leg enrichment", () => {
  it("lets a planned domestic bus be enriched without asking for time zones", async () => {
    const { user } = renderForm();

    expect(screen.getByLabelText("Shared ticket number")).toHaveValue("BUS-42");
    expect(screen.getByLabelText("Bus class or layout")).toHaveValue("Volvo");
    expect(screen.queryByText("Departure time zone")).not.toBeInTheDocument();
    expect(screen.queryByText("Destination time zone")).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Service number"), "KIA-9");
    await user.click(screen.getByRole("button", { name: "Save journey leg" }));

    await waitFor(
      () =>
        expect(mocks.updateJourneyLeg).toHaveBeenCalledWith(
          expect.objectContaining({
            tripId: trip.id,
            legId: leg.id,
            version: 3,
            operatorName: "KSRTC",
            serviceNumber: "KIA-9",
            originName: "Bengaluru",
            destinationName: "Mysuru",
            originTimezone: "Asia/Kolkata",
            destinationTimezone: "Asia/Kolkata",
            departureAt: "2026-09-28T03:30:00.000Z",
            arrivalAt: undefined,
            boardingAt: "2026-09-28T03:00:00.000Z",
            details: expect.objectContaining({
              kind: "bus",
              bus_class_or_layout: "Volvo",
              shared_ticket_number: "BUS-42"
            })
          })
        ),
      { timeout: 3000 }
    );
  });

  it("keeps cab editing compact but reveals cross-border zones when requested", async () => {
    const cabLeg: JourneyLeg = {
      ...leg,
      mode: "cab",
      operator_name: "Grab",
      service_number: null,
      origin_code: null,
      origin_name: "Changi Airport",
      origin_country_code: "SG",
      origin_timezone: "Asia/Singapore",
      destination_code: null,
      destination_name: "Johor Bahru",
      destination_country_code: "MY",
      destination_timezone: "Asia/Kuala_Lumpur",
      boarding_lead_minutes: null,
      departure_platform: null,
      details: {
        kind: "cab",
        ride_type: "airport_transfer",
        cross_border: false,
        pickup_instructions: "Door 3"
      }
    };
    const cabBooking: Booking = {
      ...booking,
      type: "cab",
      title: "Airport cab",
      journey_scope: null
    };
    const { user } = renderForm(cabBooking, cabLeg);

    expect(screen.queryByText("Boarding and platform")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Pickup instructions")).toHaveValue("Door 3");
    expect(screen.queryByText("Departure time zone")).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("Cross-border ride"));

    expect(screen.getByText("Departure time zone")).toBeInTheDocument();
    expect(screen.getByLabelText("originTimezone")).toHaveValue("Asia/Singapore");
    expect(screen.getByText("Destination time zone")).toBeInTheDocument();
  });

  it("explains why route editing waits for a connection", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    renderForm();

    expect(screen.getByRole("status")).toHaveTextContent(
      "leg, booking summary, and timeline are updated together"
    );
    expect(screen.getByRole("button", { name: "Save journey leg" })).toBeDisabled();
  });
});
