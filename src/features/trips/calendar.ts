import type { ItineraryItem, Trip } from "./types";

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function timestamp(value: string) {
  return new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function dateOnly(value: string, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}${parts.month}${parts.day}`;
}

function nextCalendarDate(value: string) {
  const date = new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

export function buildTripCalendar(trip: Trip, items: ItineraryItem[]) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Trip Vault//EN",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${escapeIcs(trip.title)}`
  ];
  for (const item of items) {
    if (
      item.timing_mode === "unscheduled" ||
      (item.timing_mode === "relative" && item.has_explicit_start_time !== true)
    )
      continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}@trip-vault`,
      `DTSTAMP:${timestamp(new Date().toISOString())}`
    );
    if (item.is_all_day || item.timing_mode === "date_only" || item.timing_mode === "all_day") {
      const startDate = dateOnly(item.starts_at, item.timezone);
      const endDate = dateOnly(item.ends_at ?? item.starts_at, item.timezone);
      lines.push(`DTSTART;VALUE=DATE:${startDate}`);
      lines.push(`DTEND;VALUE=DATE:${nextCalendarDate(endDate)}`);
    } else {
      lines.push(
        `DTSTART:${timestamp(item.starts_at)}`,
        `DTEND:${timestamp(item.ends_at ?? item.starts_at)}`
      );
    }
    lines.push(`SUMMARY:${escapeIcs(item.title)}`);
    if (item.location?.label) lines.push(`LOCATION:${escapeIcs(item.location.label)}`);
    if (item.notes) lines.push(`DESCRIPTION:${escapeIcs(item.notes)}`);
    lines.push("END:VEVENT");
  }
  return `${lines.join("\r\n")}\r\nEND:VCALENDAR\r\n`;
}

export function downloadTripCalendar(trip: Trip, items: ItineraryItem[]) {
  const url = URL.createObjectURL(
    new Blob([buildTripCalendar(trip, items)], { type: "text/calendar;charset=utf-8" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${
    trip.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "trip"
  }.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
}
