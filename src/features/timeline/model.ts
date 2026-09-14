import { isJourneyEventType, type ItineraryItem, type TripCost } from "../trips/types";
import type { Booking, FlightLeg, JourneyLeg, Requirement, Traveler, VaultDocument } from "../workspace/types";

export type TimelineSearchGroup = "Timeline" | "Bookings" | "Documents" | "Travelers" | "Readiness";
export type TimelineSearchResult = { id: string; group: TimelineSearchGroup; title: string; detail: string; timelineItemId?: string; href?: string };

export type TimelinePhase = "past" | "current" | "future" | "unscheduled";

export function hasExplicitEventStart(item: ItineraryItem) {
  const mode = item.timing_mode ?? (item.is_all_day ? "all_day" : "exact");
  return mode === "exact" || (mode === "relative" && item.has_explicit_start_time === true);
}

export function timelinePhase(item: ItineraryItem, now = new Date()): TimelinePhase {
  if (item.timing_mode === "unscheduled") return "unscheduled";
  if (item.is_all_day || item.timing_mode === "date_only" || item.timing_mode === "all_day") {
    const today = dateKey(now.toISOString(), item.timezone);
    if (today < dateKey(item.starts_at, item.timezone)) return "future";
    if (today === dateKey(item.starts_at, item.timezone)) return "current";
    return "past";
  }
  const timestamp = now.getTime();
  const start = new Date(item.starts_at).getTime();
  // A relation-only item borrows its anchor's instant solely so it can be
  // stored and grouped. It must never claim to be happening now.
  if (item.timing_mode === "relative" && !hasExplicitEventStart(item)) return timestamp < start ? "future" : "past";
  const end = new Date(item.ends_at ?? item.starts_at).getTime();
  if (timestamp < start) return "future";
  if (timestamp <= end) return "current";
  return "past";
}

export function journeyEndDetails(item: ItineraryItem) {
  if (!isJourneyEventType(item.event_type) || !item.ends_at) return null;
  return { endsAt: item.ends_at, duration: journeyDuration(item.starts_at, item.ends_at) };
}

export function eventEndDetails(item: ItineraryItem) {
  if (!item.ends_at) return null;
  return { endsAt: item.ends_at, duration: journeyDuration(item.starts_at, item.ends_at), journey: isJourneyEventType(item.event_type) };
}

export function eventEndTimeZone(item: ItineraryItem, flights: FlightLeg[], journeys: JourneyLeg[]) {
  if (!item.booking_id || !isJourneyEventType(item.event_type)) return item.timezone;
  const flight = flights.filter((leg) => leg.booking_id === item.booking_id).sort((left, right) => left.segment_order - right.segment_order).at(-1);
  if (flight) return flight.arrival_timezone;
  const journey = journeys.filter((leg) => leg.booking_id === item.booking_id).sort((left, right) => left.segment_order - right.segment_order).at(-1);
  return journey?.destination_timezone ?? item.timezone;
}

export function eventTimeLabel(item: ItineraryItem, itinerary: ItineraryItem[] = []) {
  if (item.timing_mode === "unscheduled") return "No date yet";
  if (item.timing_mode === "relative") {
    const anchor = itinerary.find((candidate) => candidate.id === item.anchor_itinerary_item_id);
    return `${item.relative_position === "before" ? "Before" : "After"} ${anchor?.title ?? "selected event"}`;
  }
  if (item.timing_mode === "date_only") return "Date only";
  if (item.timing_mode === "all_day" || item.is_all_day) return "All day";
  return null;
}

export function sortTimelineItems(items: ItineraryItem[]) {
  const baseline = [...items].sort((left, right) => {
    const leftUnscheduled = left.timing_mode === "unscheduled";
    const rightUnscheduled = right.timing_mode === "unscheduled";
    if (leftUnscheduled !== rightUnscheduled) return leftUnscheduled ? 1 : -1;
    return left.starts_at.localeCompare(right.starts_at) || (left.sort_key ?? "").localeCompare(right.sort_key ?? "") || left.id.localeCompare(right.id);
  });
  const byId = new Map(baseline.map((item) => [item.id, item]));
  const baselineIndex = new Map(baseline.map((item, index) => [item.id, index]));
  const beforeByAnchor = new Map<string, ItineraryItem[]>();
  const afterByAnchor = new Map<string, ItineraryItem[]>();
  const relatedIds = new Set<string>();
  for (const item of baseline) {
    const anchorId = item.anchor_itinerary_item_id;
    if (item.timing_mode !== "relative" || !anchorId || anchorId === item.id || !byId.has(anchorId)) continue;
    const target = item.relative_position === "before" ? beforeByAnchor : afterByAnchor;
    target.set(anchorId, [...(target.get(anchorId) ?? []), item]);
    relatedIds.add(item.id);
  }
  const stableChildren = (children: ItineraryItem[] | undefined) => [...(children ?? [])].sort((left, right) =>
    left.starts_at.localeCompare(right.starts_at)
      || (left.sort_key ?? "").localeCompare(right.sort_key ?? "")
      || (baselineIndex.get(left.id) ?? 0) - (baselineIndex.get(right.id) ?? 0));
  const ordered: ItineraryItem[] = [];
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const visit = (item: ItineraryItem) => {
    if (seen.has(item.id)) return;
    if (visiting.has(item.id)) {
      seen.add(item.id);
      ordered.push(item);
      return;
    }
    visiting.add(item.id);
    for (const child of stableChildren(beforeByAnchor.get(item.id))) visit(child);
    if (!seen.has(item.id)) { seen.add(item.id); ordered.push(item); }
    for (const child of stableChildren(afterByAnchor.get(item.id))) visit(child);
    visiting.delete(item.id);
  };
  for (const item of baseline) if (!relatedIds.has(item.id)) visit(item);
  for (const item of baseline) visit(item);
  return ordered;
}

export function resolveCurrentTimelineItem(items: ItineraryItem[], now = new Date()) {
  const ordered = sortTimelineItems(items);
  const timestamp = now.getTime();
  const available = ordered.filter((item) => !item.completed_at && (item.event_status ?? "planned") === "planned" && item.timing_mode !== "unscheduled");
  return available.find((item) => timelinePhase(item, now) === "current")
    ?? available.find((item) => new Date(item.starts_at).getTime() >= timestamp)
    ?? [...available].reverse().find(Boolean)
    ?? ordered.find((item) => item.timing_mode === "unscheduled")
    ?? ordered.at(-1)
    ?? null;
}

export function durationLabel(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const showWeeks = safeMinutes > 10_080;
  const showDays = safeMinutes > 1_440;
  const weeks = showWeeks ? Math.floor(safeMinutes / 10_080) : 0;
  const afterWeeks = showWeeks ? safeMinutes % 10_080 : safeMinutes;
  const days = showDays ? Math.floor(afterWeeks / 1_440) : 0;
  const afterDays = showDays ? afterWeeks % 1_440 : afterWeeks;
  const hours = Math.floor(afterDays / 60);
  const remainder = safeMinutes % 60;
  return [weeks ? `${weeks}w` : "", days ? `${days}d` : "", hours ? `${hours}h` : "", remainder ? `${remainder}m` : ""].filter(Boolean).join(" ") || "0m";
}

export function journeyDuration(start: string, end: string | null | undefined) {
  if (!end) return "Duration not available";
  return durationLabel((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

export function plannedDurationLabel(item: ItineraryItem) {
  if (!item.duration_minutes || item.ends_at) return null;
  return durationLabel(item.duration_minutes);
}

export function journeyRoute(legs: Array<{ origin?: string | null; destination?: string | null }>) {
  const stops: string[] = [];
  for (const leg of legs) {
    const origin = leg.origin?.trim();
    const destination = leg.destination?.trim();
    if (origin && stops.at(-1) !== origin) stops.push(origin);
    if (destination && stops.at(-1) !== destination) stops.push(destination);
  }
  return stops.join(" → ");
}

function dateKey(value: string, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function arrivalDayOffset(departureAt: string, departureTimezone: string, arrivalAt: string | null | undefined, arrivalTimezone: string) {
  if (!arrivalAt) return 0;
  const departureDate = new Date(`${dateKey(departureAt, departureTimezone)}T12:00:00Z`);
  const arrivalDate = new Date(`${dateKey(arrivalAt, arrivalTimezone)}T12:00:00Z`);
  return Math.round((arrivalDate.getTime() - departureDate.getTime()) / 86_400_000);
}

export function validateLegOrder(legs: Array<{ departureAt: string; arrivalAt?: string }>) {
  for (let index = 0; index < legs.length; index += 1) {
    const arrivalAt = legs[index].arrivalAt;
    if (arrivalAt && new Date(arrivalAt) <= new Date(legs[index].departureAt)) return `Leg ${index + 1} must arrive after it departs.`;
    const previousArrival = index > 0 ? legs[index - 1].arrivalAt : undefined;
    if (previousArrival && new Date(legs[index].departureAt) < new Date(previousArrival)) return `Leg ${index + 1} starts before leg ${index} arrives.`;
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
