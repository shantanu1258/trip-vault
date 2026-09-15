import type { ItineraryItem, TripCost } from "../trips/types";
import { documentMatchesTraveler } from "./documentModel";
import type { Booking, BookingTraveler, Requirement, RequirementAssignee, VaultDocument } from "./types";
import type { ItineraryParticipant } from "./api";

export const travelerFocusKey = (tripId: string) => `trip-vault:traveler-focus:${tripId}`;

export function readTravelerFocus(tripId: string) {
  try { return localStorage.getItem(travelerFocusKey(tripId)); } catch { return null; }
}

export function writeTravelerFocus(tripId: string, travelerId: string | null) {
  try {
    if (travelerId) localStorage.setItem(travelerFocusKey(tripId), travelerId);
    else localStorage.removeItem(travelerFocusKey(tripId));
  } catch { /* The in-memory selection still works when storage is unavailable. */ }
}

export function itineraryMatchesTraveler(item: ItineraryItem, travelerId: string, participants: ItineraryParticipant[]) {
  return item.applies_to_all_travelers || participants.some((row) => row.itinerary_item_id === item.id && row.traveler_id === travelerId);
}

export function requirementMatchesTraveler(requirementId: string, travelerId: string, assignees: RequirementAssignee[]) {
  const taskAssignees = assignees.filter((row) => row.requirement_id === requirementId);
  return taskAssignees.length === 0 || taskAssignees.some((row) => row.traveler_id === travelerId);
}

export function requirementAudienceLabel(requirementId: string, assignees: RequirementAssignee[], travelers: Array<{ id: string; display_name: string }>) {
  const travelerNames = assignees
    .filter((row) => row.requirement_id === requirementId)
    .map((row) => travelers.find((traveler) => traveler.id === row.traveler_id)?.display_name)
    .filter((name): name is string => Boolean(name));
  return travelerNames.join(", ");
}

export function filterTravelerWorkspace(input: {
  travelerId: string | null;
  itinerary: ItineraryItem[];
  participants: ItineraryParticipant[];
  bookings: Booking[];
  bookingTravelers: BookingTraveler[];
  costs: TripCost[];
  requirements: Requirement[];
  requirementAssignees: RequirementAssignee[];
  documents: VaultDocument[];
}) {
  if (!input.travelerId) return {
    itinerary: input.itinerary,
    bookings: input.bookings,
    costs: input.costs,
    requirements: input.requirements,
    documents: input.documents
  };

  const itinerary = input.itinerary.filter((item) => itineraryMatchesTraveler(item, input.travelerId!, input.participants));
  const visibleItineraryIds = new Set(itinerary.map((item) => item.id));
  const bookingIds = new Set(input.bookingTravelers.filter((row) => row.traveler_id === input.travelerId).map((row) => row.booking_id));
  for (const item of itinerary) if (item.booking_id) bookingIds.add(item.booking_id);

  return {
    itinerary,
    bookings: input.bookings.filter((booking) => bookingIds.has(booking.id)),
    costs: input.costs.filter((cost) => cost.participants?.length
      ? cost.participants.some((participant) => participant.traveler_id === input.travelerId)
      : Boolean(cost.itinerary_item_id && visibleItineraryIds.has(cost.itinerary_item_id)) || Boolean(cost.booking_id && bookingIds.has(cost.booking_id))),
    requirements: input.requirements.filter((requirement) => requirementMatchesTraveler(requirement.id, input.travelerId!, input.requirementAssignees)),
    documents: input.documents.filter((document) => documentMatchesTraveler(document, input.travelerId!))
  };
}
