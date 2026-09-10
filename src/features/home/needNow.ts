import type { Booking, FlightLeg, Requirement, VaultDocument } from "../workspace/types";

export type NeedNowItem = { id: string; label: string; detail: string; target: string; priority: number };

export function resolveNeedNow(input: { tripId: string; bookings: Booking[]; flights: FlightLeg[]; requirements: Requirement[]; documents: VaultDocument[]; limit?: number }): NeedNowItem[] {
  const candidates: NeedNowItem[] = [];
  for (const flight of input.flights) {
    const related = input.documents.filter((document) => document.flight_leg_id === flight.id || document.booking_id === flight.booking_id);
    const primary = related.find((document) => document.purpose === "boarding_pass") ?? related.find((document) => document.purpose === "ticket");
    if (primary) candidates.push({ id: `flight-document:${flight.id}`, label: primary.purpose === "boarding_pass" ? "Boarding pass" : "Flight ticket", detail: `${flight.airline_name} ${flight.flight_number}`, target: `/trips/${input.tripId}/documents/${primary.id}`, priority: primary.purpose === "boarding_pass" ? 1 : 2 });
  }
  input.requirements.filter((item) => ["visa", "passport"].includes(item.type) && !["complete", "not_required"].includes(item.status)).forEach((item) => candidates.push({ id: `requirement:${item.id}`, label: item.type === "visa" ? "Visa check" : "Passport check", detail: item.title, target: `/trips/${input.tripId}/readiness`, priority: 3 }));
  const accommodation = input.bookings.find((booking) => booking.type === "hotel");
  if (accommodation) candidates.push({ id: `booking:${accommodation.id}`, label: "Accommodation", detail: accommodation.title, target: `/trips/${input.tripId}/bookings/${accommodation.id}`, priority: 4 });
  const insurance = input.documents.find((document) => document.purpose === "insurance");
  if (insurance) candidates.push({ id: `document:${insurance.id}`, label: "Insurance", detail: insurance.title, target: `/trips/${input.tripId}/documents/${insurance.id}`, priority: 5 });
  const transport = input.bookings.find((booking) => booking.type === "transport");
  if (transport) candidates.push({ id: `booking:${transport.id}`, label: "Next transport", detail: transport.title, target: `/trips/${input.tripId}/bookings/${transport.id}`, priority: 6 });
  return candidates.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id)).slice(0, input.limit ?? 5);
}
