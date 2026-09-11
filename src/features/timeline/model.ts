import { isJourneyEventType, type ItineraryItem, type TripCost } from "../trips/types";
import type { Booking, FlightLeg, JourneyLeg, Requirement, Traveler, VaultDocument } from "../workspace/types";

export type TimelineSearchGroup = "Timeline" | "Bookings" | "Documents" | "Travelers" | "Readiness";
export type TimelineSearchResult = { id: string; group: TimelineSearchGroup; title: string; detail: string; timelineItemId?: string; href?: string };

export type TimelinePhase = "past" | "current" | "future";

export function timelinePhase(item: ItineraryItem, now = new Date()): TimelinePhase {
  if (item.is_all_day) {
    const today = dateKey(now.toISOString(), item.timezone);
    if (today < dateKey(item.starts_at, item.timezone)) return "future";
    if (today === dateKey(item.starts_at, item.timezone)) return "current";
    return "past";
  }
  const timestamp = now.getTime();
  const start = new Date(item.starts_at).getTime();
  const end = new Date(isJourneyEventType(item.event_type) ? item.ends_at ?? item.starts_at : item.starts_at).getTime();
  if (timestamp < start) return "future";
  if (timestamp <= end) return "current";
  return "past";
}

export function journeyEndDetails(item: ItineraryItem) {
  if (!isJourneyEventType(item.event_type) || !item.ends_at) return null;
  return { endsAt: item.ends_at, duration: journeyDuration(item.starts_at, item.ends_at) };
}

export function resolveCurrentTimelineItem(items: ItineraryItem[], now = new Date()) {
  const ordered = [...items].sort((left, right) => left.starts_at.localeCompare(right.starts_at) || (left.sort_key ?? "").localeCompare(right.sort_key ?? "") || left.id.localeCompare(right.id));
  const timestamp = now.getTime();
  return ordered.find((item) => !item.completed_at && timelinePhase(item, now) === "current")
    ?? ordered.find((item) => !item.completed_at && new Date(item.starts_at).getTime() >= timestamp)
    ?? [...ordered].reverse().find((item) => !item.completed_at)
    ?? ordered.at(-1)
    ?? null;
}

export function journeyDuration(start: string, end: string) {
  const minutes = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
  const days = Math.floor(minutes / 1_440); const hours = Math.floor((minutes % 1_440) / 60); const remainder = minutes % 60;
  return [days ? `${days}d` : "", hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ") || "0m";
}

function dateKey(value: string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function arrivalDayOffset(departureAt: string, departureTimezone: string, arrivalAt: string, arrivalTimezone: string) {
  const departureDate = new Date(`${dateKey(departureAt, departureTimezone)}T12:00:00Z`);
  const arrivalDate = new Date(`${dateKey(arrivalAt, arrivalTimezone)}T12:00:00Z`);
  return Math.round((arrivalDate.getTime() - departureDate.getTime()) / 86_400_000);
}

export function validateLegOrder(legs: Array<{ departureAt: string; arrivalAt: string }>) {
  for (let index = 0; index < legs.length; index += 1) {
    if (new Date(legs[index].arrivalAt) <= new Date(legs[index].departureAt)) return `Leg ${index + 1} must arrive after it departs.`;
    if (index > 0 && new Date(legs[index].departureAt) < new Date(legs[index - 1].arrivalAt)) return `Leg ${index + 1} starts before leg ${index} arrives.`;
  }
  return null;
}

export function normalizePhoneNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `${hasPlus ? "+" : ""}${digits}`;
}

export function phoneActionUrls(value: string) {
  const normalized = normalizePhoneNumber(value);
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  return { call: `tel:${normalized}`, whatsapp: `https://wa.me/${digits}` };
}

export function mapsUrl(location?: { label?: string; address?: string; map_url?: string } | null) {
  if (location?.map_url) return location.map_url;
  const destination = location?.address || location?.label;
  return destination ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}` : null;
}

export function readinessSummary(requirements: Requirement[]) {
  const resolved = requirements.filter((item) => item.status === "complete" || item.status === "not_required").length;
  const incomplete = requirements.filter((item) => item.status !== "complete" && item.status !== "not_required");
  const dueDate = incomplete.map((item) => item.due_date).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
  return { total: requirements.length, resolved, remaining: incomplete.length, dueDate };
}

function normalized(value: unknown) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();
}

export function searchTrip(input: { query: string; tripId: string; itinerary: ItineraryItem[]; bookings: Booking[]; flights: FlightLeg[]; journeys: JourneyLeg[]; documents: VaultDocument[]; travelers: Traveler[]; requirements: Requirement[] }): TimelineSearchResult[] {
  const query = normalized(input.query).trim();
  if (query.length < 2) return [];
  const results: TimelineSearchResult[] = [];
  const matches = (...values: unknown[]) => normalized(values.join(" ")).includes(query);
  for (const item of input.itinerary) if (matches(item.title, item.event_type, item.notes, item.location?.label, item.location?.address)) results.push({ id: `event:${item.id}`, group: "Timeline", title: item.title, detail: (item.event_type ?? "event").replaceAll("_", " "), timelineItemId: item.id });
  for (const booking of input.bookings) {
    const flightText = input.flights.filter((leg) => leg.booking_id === booking.id).flatMap((leg) => [leg.airline_name, leg.flight_number, leg.departure_airport_code, leg.departure_airport_name, leg.arrival_airport_code, leg.arrival_airport_name]);
    const journeyText = input.journeys.filter((leg) => leg.booking_id === booking.id).flatMap((leg) => [leg.operator_name, leg.service_number, leg.origin_code, leg.origin_name, leg.destination_code, leg.destination_name]);
    if (matches(booking.title, booking.type, booking.provider, booking.reference_code, booking.booked_via_name, ...flightText, ...journeyText)) results.push({ id: `booking:${booking.id}`, group: "Bookings", title: booking.title, detail: [booking.type, booking.reference_code].filter(Boolean).join(" · "), href: booking.type === "flight" && input.flights.find((leg) => leg.booking_id === booking.id) ? `/trips/${input.tripId}/flights/${input.flights.find((leg) => leg.booking_id === booking.id)!.id}` : `/trips/${input.tripId}/bookings/${booking.id}` });
  }
  for (const document of input.documents) if (matches(document.title, document.category, document.purpose, document.short_label)) results.push({ id: `document:${document.id}`, group: "Documents", title: document.title, detail: document.purpose.replaceAll("_", " "), href: `/trips/${input.tripId}/documents/${document.id}` });
  for (const traveler of input.travelers) if (matches(traveler.display_name)) results.push({ id: `traveler:${traveler.id}`, group: "Travelers", title: traveler.display_name, detail: traveler.is_minor ? "Managed child" : "Traveler" });
  for (const requirement of input.requirements) if (matches(requirement.title, requirement.type, requirement.status, requirement.destination_country_code, requirement.notes)) results.push({ id: `requirement:${requirement.id}`, group: "Readiness", title: requirement.title, detail: requirement.status.replaceAll("_", " "), href: `/trips/${input.tripId}/readiness` });
  return results.slice(0, 40);
}

export function costsForEvent(item: ItineraryItem, costs: TripCost[]) {
  return costs.filter((cost) => cost.itinerary_item_id === item.id || Boolean(item.booking_id && cost.booking_id === item.booking_id));
}
