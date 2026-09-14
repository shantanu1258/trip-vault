import type { ItineraryItem, Trip, TripCost } from "./types";
import { currencyFractionDigits } from "./validation";

export type TripPhase = "current" | "upcoming" | "past";

function dateKeyInTimezone(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousCalendarDay(date: string) {
  const value = new Date(`${date}T12:00:00Z`); value.setUTCDate(value.getUTCDate() - 1); return value.toISOString().slice(0, 10);
}

export function tripPhase(trip: Trip, now = new Date()): TripPhase {
  const currentDate = dateKeyInTimezone(now, trip.primary_timezone);
  if (currentDate >= previousCalendarDay(trip.start_date) && currentDate <= trip.end_date) return "current";
  if (currentDate < trip.start_date) return "upcoming";
  return "past";
}

export function selectFocusedTrip(trips: Trip[], savedTripId?: string | null, now = new Date()) {
  const active = trips.filter((trip) => trip.status !== "archived" && tripPhase(trip, now) === "current");
  if (active.length) {
    const saved = active.find((trip) => trip.id === savedTripId); if (saved) return saved;
    return [...active].sort((left, right) => left.end_date.localeCompare(right.end_date) || left.start_date.localeCompare(right.start_date) || left.id.localeCompare(right.id))[0];
  }
  return sortTripsByRelevance(trips)[0];
}

export function sortTripsByRelevance(trips: Trip[]) {
  const priority: Record<TripPhase, number> = { current: 0, upcoming: 1, past: 2 };
  return [...trips].sort((left, right) => {
    const phaseDifference = priority[tripPhase(left)] - priority[tripPhase(right)];
    if (phaseDifference !== 0) return phaseDifference;
    if (tripPhase(left) === "past") return right.end_date.localeCompare(left.end_date);
    return left.start_date.localeCompare(right.start_date);
  });
}

export function formatDate(date: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", ...options }).format(
    new Date(`${date}T12:00:00`)
  );
}

export function formatDateRange(startDate: string, endDate: string) {
  const formatTripDate = (date: string) => new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${date}T12:00:00Z`));
  if (startDate === endDate) return formatTripDate(startDate);
  return `${formatTripDate(startDate)} - ${formatTripDate(endDate)}`;
}

export function formatEventTime(isoDate: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone
  }).format(new Date(isoDate));
}

export function itineraryDateKey(isoDate: string, timeZone: string) {
  return dateKeyInTimezone(new Date(isoDate), timeZone);
}

export function formatItineraryDate(isoDate: string, timeZone: string) {
  return new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone }).format(new Date(isoDate));
}

export function currentItineraryItem(items: ItineraryItem[], now = new Date()) {
  const time = now.getTime();
  return items.find((item) => !item.is_all_day && new Date(item.starts_at).getTime() <= time && new Date(item.ends_at ?? item.starts_at).getTime() >= time)
    ?? items.find((item) => new Date(item.starts_at).getTime() >= time);
}

export function moveEqualTimeItem(items: ItineraryItem[], itemId: string, direction: "up" | "down") {
  const currentIndex = items.findIndex((item) => item.id === itemId);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= items.length || items[currentIndex].starts_at !== items[targetIndex].starts_at) return items;
  const reordered = [...items];
  [reordered[currentIndex], reordered[targetIndex]] = [reordered[targetIndex], reordered[currentIndex]];
  return reordered.map((item, index) => ({ ...item, sort_key: `${String(index).padStart(8, "0")}:${item.id}` }));
}

export function groupCostTotals(costs: TripCost[]) {
  return costs.reduce<Record<string, number>>((totals, cost) => {
    if (cost.payment_status === "refunded") return totals;
    totals[cost.currency_code] = (totals[cost.currency_code] ?? 0) + Number(cost.amount_minor);
    return totals;
  }, {});
}

export function formatMoney(amountMinor: number, currencyCode: string) {
  const divisor = 10 ** (currencyFractionDigits(currencyCode) ?? 2);
  return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(amountMinor / divisor);
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") return error.message;
  return "Something went wrong. Please try again.";
}
