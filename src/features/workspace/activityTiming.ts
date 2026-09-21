import type { ItineraryItem } from "../trips/types";
import type { Booking } from "./types";

export function activityBookingTiming(item: ItineraryItem) {
  const timed =
    (item.timing_mode ?? "exact") === "exact" ||
    (item.timing_mode === "relative" && item.has_explicit_start_time === true);
  return {
    source_timezone: item.timezone,
    start_at: timed ? item.starts_at : null,
    end_at: timed ? item.ends_at : null
  };
}

export function activityEventTiming(item: ItineraryItem, booking: Booking): Partial<ItineraryItem> {
  if (booking.type !== "activity" || item.event_type !== "activity" || !booking.source_timezone)
    return {};
  const sameInstant = (a: string | null, b: string | null) =>
    a === b || Boolean(a && b && Date.parse(a) === Date.parse(b));
  if (
    item.timezone === booking.source_timezone &&
    (!booking.start_at ||
      (sameInstant(item.starts_at, booking.start_at) &&
        sameInstant(item.ends_at, booking.end_at) &&
        item.has_explicit_start_time))
  )
    return {};
  if (!booking.start_at) return { timezone: booking.source_timezone };
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: booking.source_timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(booking.start_at));
  return {
    timezone: booking.source_timezone,
    starts_at: booking.start_at,
    ends_at: booking.end_at,
    timing_mode: item.timing_mode === "relative" ? "relative" : "exact",
    has_explicit_start_time: true,
    is_all_day: false,
    scheduled_date: date,
    duration_minutes: booking.end_at
      ? Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000)
      : null
  };
}

export function applyActivityTiming<T extends { version?: number; updated_at?: string }>(
  row: T,
  patch: Partial<T>
): T {
  if (
    !Object.entries(patch).some(([key, value]) => {
      const original = row[key as keyof T];
      if (key.endsWith("_at") && typeof original === "string" && typeof value === "string")
        return Date.parse(original) !== Date.parse(value);
      return original !== value;
    })
  )
    return row;
  return {
    ...row,
    ...patch,
    version: (row.version ?? 1) + 1,
    updated_at: new Date().toISOString()
  };
}
