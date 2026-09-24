import type { ItineraryItem } from "../trips/types";
import { documentMatchesTraveler, documentPurposeLabel } from "../workspace/documentModel";
import type { Booking, FlightLeg, Requirement, Traveler, VaultDocument } from "../workspace/types";
import type { EventDocumentReference } from "../workspace/tripRelationships";

export type NeedNowItem = {
  id: string;
  label: string;
  detail: string;
  target: string;
  priority: number;
  documentCategory?: VaultDocument["category"];
};

export type RankedTripDocument = {
  document: VaultDocument;
  contextKey: string;
  contextTitle: string;
  occursAt: number;
  purposePriority: number;
};

const purposePriority: Record<VaultDocument["purpose"], number> = {
  boarding_pass: 0,
  ticket: 1,
  visa: 2,
  passport: 3,
  arrival_card: 4,
  hotel_confirmation: 5,
  confirmation: 6,
  activity_ticket: 7,
  meal_voucher: 8,
  insurance: 9,
  baggage_tag: 10,
  receipt: 11,
  other: 12
};

function instant(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const result = new Date(value).getTime();
  return Number.isFinite(result) ? result : Number.POSITIVE_INFINITY;
}

function relevantEventTime(item: ItineraryItem, now: number) {
  const end = instant(item.ends_at ?? item.starts_at);
  return end >= now ? instant(item.starts_at) : Number.POSITIVE_INFINITY;
}

export function documentsForTravelerAccounts(documents: VaultDocument[], travelerIds: string[]) {
  return documents.filter((document) => {
    const mode = document.assignment_mode ?? (document.traveler_id ? "selected" : "shared");
    return mode === "shared" || travelerIds.some((id) => documentMatchesTraveler(document, id));
  });
}

export function documentAudienceSummary(document: VaultDocument, travelers: Traveler[]) {
  const mode = document.assignment_mode ?? (document.traveler_id ? "selected" : "shared");
  if (mode === "shared") return "Everyone";
  if (mode === "unassigned") return "Assign later";
  const ids = document.traveler_ids?.length
    ? document.traveler_ids
    : document.traveler_id
      ? [document.traveler_id]
      : [];
  const names = ids
    .map((id) => travelers.find((traveler) => traveler.id === id)?.display_name)
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join(", ") : "Selected traveler";
}

/**
 * Orders files by the event where they will be used. File type is only the
 * tie-breaker inside the same event, so a later boarding pass cannot displace
 * a ticket or confirmation needed for an earlier event.
 */
export function rankDocumentsForUpcomingEvents(input: {
  documents: VaultDocument[];
  itinerary?: ItineraryItem[];
  bookings?: Booking[];
  flights?: FlightLeg[];
  eventDocumentReferences?: EventDocumentReference[];
  now?: Date;
}): RankedTripDocument[] {
  const now = (input.now ?? new Date()).getTime();
  const itinerary = input.itinerary ?? [];
  const bookings = input.bookings ?? [];
  const flights = input.flights ?? [];
  const references = input.eventDocumentReferences ?? [];
  const eventsById = new Map(itinerary.map((item) => [item.id, item]));
  const eventsByBooking = new Map<string, ItineraryItem[]>();
  const referenceEventsByDocument = new Map<string, ItineraryItem[]>();
  const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
  const flightsById = new Map(flights.map((flight) => [flight.id, flight]));

  for (const item of itinerary) {
    if (!item.booking_id) continue;
    const group = eventsByBooking.get(item.booking_id);
    if (group) group.push(item);
    else eventsByBooking.set(item.booking_id, [item]);
  }
  for (const reference of references) {
    const event = eventsById.get(reference.itinerary_item_id);
    if (!event) continue;
    const group = referenceEventsByDocument.get(reference.document_id);
    if (group) group.push(event);
    else referenceEventsByDocument.set(reference.document_id, [event]);
  }

  return input.documents
    .map((document): RankedTripDocument => {
      const flight = document.flight_leg_id ? flightsById.get(document.flight_leg_id) : undefined;
      const bookingId = document.booking_id ?? flight?.booking_id ?? null;
      const relatedEvents = [
        ...(referenceEventsByDocument.get(document.id) ?? []),
        ...(bookingId ? (eventsByBooking.get(bookingId) ?? []) : [])
      ];
      const nextEvent = relatedEvents
        .map((event) => ({ event, time: relevantEventTime(event, now) }))
        .filter((candidate) => Number.isFinite(candidate.time))
        .sort(
          (left, right) => left.time - right.time || left.event.id.localeCompare(right.event.id)
        )
        .at(0);
      const booking = bookingId ? bookingsById.get(bookingId) : undefined;
      const flightTime = instant(flight?.scheduled_departure_at);
      const bookingTime = instant(booking?.start_at);
      const occursAt = nextEvent?.time ?? Math.min(flightTime, bookingTime);
      const contextKey = nextEvent
        ? `event:${nextEvent.event.id}`
        : flight
          ? `flight:${flight.id}`
          : booking
            ? `booking:${booking.id}`
            : `document:${document.id}`;
      const contextTitle =
        nextEvent?.event.title ||
        (flight
          ? `${flight.departure_airport_code || flight.departure_airport_name} → ${flight.arrival_airport_code || flight.arrival_airport_name}`
          : booking?.title || documentPurposeLabel(document.purpose));
      return {
        document,
        contextKey,
        contextTitle,
        occursAt,
        purposePriority: purposePriority[document.purpose]
      };
    })
    .sort(
      (left, right) =>
        left.occursAt - right.occursAt ||
        left.purposePriority - right.purposePriority ||
        left.document.title.localeCompare(right.document.title)
    );
}

export function resolveNeedNow(input: {
  tripId: string;
  bookings: Booking[];
  flights: FlightLeg[];
  requirements: Requirement[];
  documents: VaultDocument[];
  itinerary?: ItineraryItem[];
  eventDocumentReferences?: EventDocumentReference[];
  travelers?: Traveler[];
  limit?: number;
  now?: Date;
}): NeedNowItem[] {
  const candidates: NeedNowItem[] = [];
  const rankedDocuments = rankDocumentsForUpcomingEvents(input);
  const representedContexts = new Set<string>();

  for (const ranked of rankedDocuments) {
    if (representedContexts.has(ranked.contextKey)) continue;
    representedContexts.add(ranked.contextKey);
    const audience = documentAudienceSummary(ranked.document, input.travelers ?? []);
    candidates.push({
      id: `document:${ranked.document.id}`,
      label: ranked.document.title,
      detail: `${documentPurposeLabel(ranked.document.purpose)} · ${audience} · ${ranked.contextTitle}`,
      target: `/trips/${input.tripId}/documents/${ranked.document.id}`,
      documentCategory: ranked.document.category,
      priority: Number.isFinite(ranked.occursAt) ? ranked.occursAt : Number.MAX_SAFE_INTEGER - 10
    });
  }

  input.requirements
    .filter(
      (item) =>
        ["visa", "passport"].includes(item.type) &&
        !["complete", "not_required"].includes(item.status)
    )
    .forEach((item) =>
      candidates.push({
        id: `requirement:${item.id}`,
        label: item.title,
        detail: item.type === "visa" ? "Visa task" : "Passport task",
        target: `/trips/${input.tripId}/readiness`,
        priority: instant(item.due_date)
      })
    );

  if (!rankedDocuments.length) {
    const accommodation = input.bookings.find((booking) => booking.type === "hotel");
    if (accommodation)
      candidates.push({
        id: `booking:${accommodation.id}`,
        label: accommodation.title,
        detail: "Accommodation",
        target: `/trips/${input.tripId}/bookings/${accommodation.id}`,
        priority: instant(accommodation.start_at)
      });
  }

  return candidates
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
    .slice(0, input.limit ?? 5);
}
