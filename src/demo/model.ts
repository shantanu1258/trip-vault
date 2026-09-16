import type { Traveler, VaultDocument, Booking } from "../features/workspace/types";
import type { TripCost } from "../features/trips/types";
import { demoDocuments, demoEvents, demoTravelers } from "./data";

const eventStartTimes: Record<string, { start: string; end?: string }> = {
  "flight-out": { start: "2026-06-18T04:40:00.000Z", end: "2026-06-18T10:10:00.000Z" },
  "hotel-rome": { start: "2026-06-18T13:00:00.000Z" },
  colosseum: { start: "2026-06-19T14:30:00.000Z", end: "2026-06-19T17:00:00.000Z" },
  "train-florence": { start: "2026-06-21T07:10:00.000Z", end: "2026-06-21T08:46:00.000Z" },
  "venice-walk": { start: "2026-06-24T16:00:00.000Z", end: "2026-06-24T18:00:00.000Z" }
};

const documentAudience: Record<
  string,
  {
    visibility: VaultDocument["visibility"];
    travelerIds: string[];
    assignment: "shared" | "selected";
  }
> = {
  "flight-ticket": {
    visibility: "selected_members",
    travelerIds: ["sam", "mia", "noah", "leela", "ari"],
    assignment: "selected"
  },
  "boarding-pass": {
    visibility: "traveler_and_managers",
    travelerIds: ["sam"],
    assignment: "selected"
  },
  "hotel-confirmation": { visibility: "trip", travelerIds: [], assignment: "shared" },
  insurance: {
    visibility: "selected_members",
    travelerIds: ["sam", "mia", "noah", "leela", "ari"],
    assignment: "selected"
  },
  "museum-ticket": {
    visibility: "selected_members",
    travelerIds: ["sam", "mia", "noah", "ari"],
    assignment: "selected"
  },
  "entry-waiver": {
    visibility: "selected_members",
    travelerIds: ["sam", "mia", "noah", "ari"],
    assignment: "selected"
  }
};

const documentPurpose: Record<string, VaultDocument["purpose"]> = {
  "flight-ticket": "ticket",
  "boarding-pass": "boarding_pass",
  "hotel-confirmation": "hotel_confirmation",
  insurance: "insurance",
  "museum-ticket": "activity_ticket",
  "entry-waiver": "other"
};

const bookingType: Record<string, Booking["type"]> = {
  flight: "flight",
  hotel: "hotel",
  activity: "activity",
  train: "train"
};

export const demoTravelersAsTravelers: Traveler[] = demoTravelers
  .filter((traveler) => traveler.role !== "Non-travelling collaborator")
  .map((traveler) => ({
    id: traveler.id,
    trip_id: "demo-trip",
    display_name: traveler.name,
    is_minor: traveler.role.includes("child"),
    created_at: "2026-01-01T00:00:00.000Z",
    status: "active"
  }));

export const demoBookings: Booking[] = demoEvents
  .filter((event) => event.id !== "venice-walk")
  .map((event) => {
    const timing = eventStartTimes[event.id];
    return {
      id: event.id,
      trip_id: "demo-trip",
      type: bookingType[event.type] ?? "other",
      title: event.title,
      provider: event.eyebrow,
      reference_code: event.type === "flight" ? "SAMPLE7" : null,
      start_at: timing.start,
      end_at: timing.end ?? null,
      source_timezone: "Europe/Rome",
      location: { label: event.location },
      details: {},
      reservation_state: event.type === "activity" ? "planned" : "booked",
      participant_scope: "selected",
      journey_scope: event.type === "flight" ? "international" : null,
      booked_via_name: event.type === "hotel" ? "Trip.com" : null,
      created_at: "2026-01-01T00:00:00.000Z"
    };
  });

export const demoVaultDocuments: VaultDocument[] = demoDocuments.map((document) => {
  const audience = documentAudience[document.id];
  const linkedEvent = demoEvents.find((event) => event.documentIds.includes(document.id));
  return {
    id: document.id,
    trip_id: "demo-trip",
    booking_id: linkedEvent?.id ?? null,
    flight_leg_id: null,
    journey_leg_id: null,
    traveler_id: audience.travelerIds.length === 1 ? audience.travelerIds[0] : null,
    assignment_mode: audience.assignment,
    traveler_ids: audience.travelerIds,
    title: document.title,
    category:
      linkedEvent?.type === "hotel"
        ? "hotel"
        : linkedEvent?.type === "activity"
          ? "activity"
          : "flight",
    purpose: documentPurpose[document.id] ?? "other",
    short_label: document.purpose,
    visibility: audience.visibility,
    current_version_id: `${document.id}-version`,
    updated_at: "2026-06-01T00:00:00.000Z",
    current_version: {
      id: `${document.id}-version`,
      storage_bucket: "trip-documents",
      storage_path: document.url,
      original_filename: `${document.id}.pdf`,
      mime_type: "application/pdf",
      byte_size: 3_072,
      sha256: "demo",
      version_number: 1,
      created_at: "2026-06-01T00:00:00.000Z"
    }
  };
});

export const demoCosts: TripCost[] = [
  {
    id: "flight-cost",
    trip_id: "demo-trip",
    booking_id: "flight-out",
    itinerary_item_id: null,
    title: "Aster Air flights",
    category: "flight",
    amount_minor: 234_000,
    currency_code: "EUR",
    payment_status: "paid",
    paid_by_traveler_id: "sam",
    participants: ["sam", "mia", "noah", "leela", "ari"].map((traveler_id) => ({
      traveler_id,
      share_amount_minor: 46_800
    })),
    notes: "Sample return flight booking.",
    created_at: "2026-05-01T00:00:00.000Z"
  },
  {
    id: "hotel-cost",
    trip_id: "demo-trip",
    booking_id: "hotel-rome",
    itinerary_item_id: null,
    title: "Casa Bellora",
    category: "hotel",
    amount_minor: 186_000,
    currency_code: "EUR",
    payment_status: "paid",
    paid_by_traveler_id: "mia",
    participants: ["sam", "mia", "noah", "leela", "ari"].map((traveler_id) => ({
      traveler_id,
      share_amount_minor: 37_200
    })),
    notes: "Three-night sample stay.",
    created_at: "2026-05-03T00:00:00.000Z"
  },
  {
    id: "activity-cost",
    trip_id: "demo-trip",
    booking_id: "colosseum",
    itinerary_item_id: null,
    title: "Colosseum evening tour",
    category: "activity",
    amount_minor: 66_000,
    currency_code: "EUR",
    payment_status: "paid",
    paid_by_traveler_id: "sam",
    participants: ["sam", "mia", "noah", "ari"].map((traveler_id) => ({
      traveler_id,
      share_amount_minor: 16_500
    })),
    notes: null,
    created_at: "2026-05-05T00:00:00.000Z"
  }
];

export const demoBookingById = new Map(demoBookings.map((booking) => [booking.id, booking]));
export const demoVaultDocumentById = new Map(
  demoVaultDocuments.map((document) => [document.id, document])
);

export function demoDocumentsForTraveler(travelerId: string | null) {
  if (!travelerId) return demoVaultDocuments;
  return demoVaultDocuments.filter(
    (document) =>
      document.assignment_mode === "shared" || document.traveler_ids?.includes(travelerId)
  );
}
