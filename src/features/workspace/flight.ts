import type { FlightLeg, VaultDocument } from "./types";

export function primaryFlightDocument(documents: VaultDocument[]) {
  return documents.find((document) => document.purpose === "boarding_pass") ?? documents.find((document) => document.purpose === "ticket") ?? null;
}

export function effectiveDeparture(flight: FlightLeg) {
  return flight.status === "delayed" && flight.estimated_departure_at ? flight.estimated_departure_at : flight.scheduled_departure_at;
}

export function delayMinutes(flight: FlightLeg) {
  if (!flight.estimated_departure_at) return 0;
  return Math.max(0, Math.round((new Date(flight.estimated_departure_at).getTime() - new Date(flight.scheduled_departure_at).getTime()) / 60_000));
}

export function flightCountdown(flight: FlightLeg, now = new Date()) {
  if (flight.status === "cancelled") return "Cancelled";
  if (flight.status === "landed") return "Landed";
  if (flight.status === "departed") return "Departed";
  const minutes = Math.round((new Date(effectiveDeparture(flight)).getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "Departure time passed";
  if (minutes < 60) return `${minutes} min to departure`;
  const hours = Math.floor(minutes / 60); const remainder = minutes % 60;
  return `${hours}h${remainder ? ` ${remainder}m` : ""} to departure`;
}

export function trackerUrl(flightNumber: string) {
  return `https://www.flightaware.com/live/flight/${encodeURIComponent(flightNumber.replace(/\s+/g, ""))}`;
}

export function toDateTimeLocal(iso: string | null, timeZone: string) {
  if (!iso) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
