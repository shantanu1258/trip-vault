import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip } from "../trips/types";
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
  TimeZoneAutocomplete: ({
    name,
    defaultValue,
    required
  }: {
    name: string;
    defaultValue?: string;
    required?: boolean;
  }) => <input aria-label={name} name={name} defaultValue={defaultValue} required={required} />
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

const itineraryItem: ItineraryItem = {
  id: "bus-event",
  trip_id: trip.id,
  booking_id: booking.id,
  title: booking.title,
  event_type: "bus",
  starts_at: leg.scheduled_departure_at,
  ends_at: null,
  timezone: leg.origin_timezone,
  location: null,
  notes: null,
  applies_to_all_travelers: true,
  timing_mode: "exact",
  created_at: "2026-09-01T00:00:00.000Z"
};

const anchor: ItineraryItem = {
  ...itineraryItem,
  id: "hotel-checkout",
  booking_id: "hotel-1",
  title: "Hotel checkout",
  event_type: "hotel_check_out",
  starts_at: "2026-09-28T02:30:00.000Z"
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
          itinerary={[anchor, itineraryItem]}
          itineraryItem={itineraryItem}
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
  it.each(["train", "ferry"] as const)(
    "keeps booking-level timeline placement available while editing a %s",
    (mode) => {
      renderForm(
        { ...booking, type: mode },
        { ...leg, mode, details: mode === "train" ? { kind: "train" } : { kind: "ferry" } }
      );

      expect(screen.getByRole("group", { name: "Timeline placement" })).toBeInTheDocument();
      expect(screen.getByLabelText("Place in timeline")).toHaveTextContent(
        `Use ${mode} departure time`
      );
    }
  );

  it("lets a planned domestic bus be enriched without asking for time zones", async () => {
    const { user } = renderForm();

    expect(screen.getByLabelText("Shared ticket number")).toHaveValue("BUS-42");
    expect(screen.getByLabelText("Bus class or layout")).toHaveValue("Volvo");
    expect(screen.queryByText("Departure time zone")).not.toBeInTheDocument();
    expect(screen.queryByText("Destination time zone")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Place in timeline"), "relative");
    await user.selectOptions(screen.getByLabelText("Event"), anchor.id);

    await user.type(screen.getByLabelText("Service number"), "KIA-9");
    await user.click(screen.getByRole("button", { name: "Save journey changes" }));

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
            itineraryTiming: {
              timingMode: "relative",
              anchorItineraryItemId: anchor.id,
              relativePosition: "after"
            },
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

  it("keeps ferry editing compact while preserving older hidden ticket details", async () => {
    const ferryBooking: Booking = {
      ...booking,
      type: "ferry",
      title: "Ferry to Batam",
      provider: "Batam Fast",
      reference_code: "ORDER-42",
      reservation_state: "booked"
    };
    const ferryLeg: JourneyLeg = {
      ...leg,
      mode: "ferry",
      operator_name: "Batam Fast",
      service_number: "BF-12",
      origin_code: null,
      origin_name: "HarbourFront",
      destination_code: null,
      destination_name: "Batam Centre",
      boarding_at: "2026-09-28T03:00:00.000Z",
      departure_platform: "Gate 3",
      arrival_platform: "Pier 2",
      details: {
        kind: "ferry",
        seating: "assigned",
        vessel_name: "Nautica",
        vehicle: { type: "car", registration: "SG1234" }
      }
    };
    const { user } = renderForm(ferryBooking, ferryLeg);

    expect(screen.getByLabelText("operatorName")).toHaveValue("Batam Fast");
    expect(screen.getByLabelText("Vessel or service number")).toHaveValue("BF-12");
    expect(screen.queryByText("Ferry ticket details")).not.toBeInTheDocument();
    expect(screen.queryByText("Boarding and platform")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Sailing direction")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Seating")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Vehicle registration")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save journey changes" }));

    await waitFor(() =>
      expect(mocks.updateJourneyLeg).toHaveBeenCalledWith(
        expect.objectContaining({
          boardingAt: "2026-09-28T03:00:00.000Z",
          boardingLeadMinutes: 30,
          departurePlatform: "Gate 3",
          arrivalPlatform: "Pier 2",
          details: ferryLeg.details
        })
      )
    );
  });

  it("edits an international bus without country codes but still validates supplied codes", async () => {
    const internationalBooking: Booking = {
      ...booking,
      title: "International bus",
      journey_scope: "international"
    };
    const internationalLeg: JourneyLeg = {
      ...leg,
      origin_name: "Bugis",
      origin_code: null,
      origin_country_code: null,
      origin_timezone: "Asia/Singapore",
      destination_name: "City terminal",
      destination_code: null,
      destination_country_code: null,
      destination_timezone: "Asia/Dubai"
    };
    const { user } = renderForm(internationalBooking, internationalLeg);

    const departureCountry = screen.getByLabelText("Departure country code (optional)");
    const destinationCountry = screen.getByLabelText("Destination country code (optional)");
    expect(departureCountry).not.toBeRequired();
    expect(destinationCountry).not.toBeRequired();
    expect(departureCountry).toHaveAttribute("pattern", "[A-Za-z]{2}");
    expect(screen.getByLabelText("originTimezone")).toBeRequired();
    expect(screen.getByLabelText("destinationTimezone")).toBeRequired();

    await user.type(departureCountry, "S");
    expect(departureCountry).toBeInvalid();
    fireEvent.submit(screen.getByRole("button", { name: "Save journey changes" }).closest("form")!);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Use a 2-letter departure country code."
    );
    expect(mocks.updateJourneyLeg).not.toHaveBeenCalled();

    await user.clear(departureCountry);
    await user.click(screen.getByRole("button", { name: "Save journey changes" }));

    await waitFor(() =>
      expect(mocks.updateJourneyLeg).toHaveBeenCalledWith(
        expect.objectContaining({
          originCountryCode: undefined,
          originTimezone: "Asia/Singapore",
          destinationCountryCode: undefined,
          destinationTimezone: "Asia/Dubai"
        })
      )
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
    expect(screen.queryByLabelText("Pickup code")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drop-off code")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Return date and time")).not.toBeInTheDocument();
    expect(
      screen.getByText("Vehicle, driver, and pickup details").closest("details")
    ).not.toHaveAttribute("open");
    expect(screen.getByLabelText("Pickup instructions")).toHaveValue("Door 3");
    expect(screen.queryByText("Departure time zone")).not.toBeInTheDocument();
    expect(screen.getByText("Journey time zone")).toBeInTheDocument();
    expect(screen.getByLabelText("Departure (local time)")).toBeInTheDocument();
    expect(screen.getByLabelText("Arrival (local time, optional)")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Cross-border ride"));

    expect(screen.getByText("Departure time zone")).toBeInTheDocument();
    expect(screen.getByLabelText("originTimezone")).toHaveValue("Asia/Singapore");
    expect(screen.getByText("Destination time zone")).toBeInTheDocument();
  });

  it("does not force duplicate route details for an hourly or day hire", async () => {
    const cabLeg: JourneyLeg = {
      ...leg,
      mode: "cab",
      operator_name: "Local driver",
      origin_code: "OLD-PICKUP-CODE",
      origin_name: "Hotel",
      destination_code: "OLD-DROPOFF-CODE",
      destination_name: "Hotel",
      boarding_lead_minutes: null,
      departure_platform: null,
      details: { kind: "cab", ride_type: "hourly", return_at: "2026-09-28T12:00:00.000Z" }
    };
    const cabBooking: Booking = {
      ...booking,
      type: "cab",
      title: "Car and driver",
      journey_scope: null
    };
    const { user } = renderForm(cabBooking, cabLeg);

    expect(screen.getByLabelText("Final drop-off (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Final drop-off (optional)")).not.toBeRequired();
    expect(screen.getByLabelText("Hire starts (local time)")).toBeInTheDocument();
    expect(screen.getByLabelText("Hire ends (local time, optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pickup code")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Drop-off code")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Return date and time")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save journey changes" }));

    await waitFor(() =>
      expect(mocks.updateJourneyLeg).toHaveBeenCalledWith(
        expect.objectContaining({
          originName: "Hotel",
          originCode: undefined,
          destinationName: "Hotel",
          destinationCode: undefined,
          details: expect.objectContaining({ kind: "cab", ride_type: "hourly" })
        })
      )
    );
    expect(mocks.updateJourneyLeg.mock.calls[0][0].details).not.toHaveProperty("return_at");
  });

  it("explains why route editing waits for a connection", () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    renderForm();

    expect(screen.getByRole("status")).toHaveTextContent(
      "connection, booking summary, and timeline are updated together"
    );
    expect(screen.getByRole("button", { name: "Save journey changes" })).toBeDisabled();
  });
});
