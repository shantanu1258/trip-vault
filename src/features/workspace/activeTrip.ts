import type { ItineraryItem, Reminder } from "../trips/types";
import { localDateTimeToIso } from "../trips/validation";
import { requirementTimelineSchedule } from "../timeline/model";
import type { Requirement } from "./types";

/** Use the actual itinerary span, not the manually entered trip dates. */
export function itinerarySpan(events: ItineraryItem[]): { start: number; end: number } | null {
  const bounds = events.flatMap((event) => {
    if (
      event.deleted_at ||
      ["cancelled", "skipped"].includes(event.event_status ?? "") ||
      event.timing_mode === "unscheduled"
    )
      return [];
    try {
      const untimed =
        event.is_all_day || event.timing_mode === "date_only" || event.timing_mode === "all_day";
      const start =
        untimed && event.scheduled_date
          ? Date.parse(
              localDateTimeToIso(`${event.scheduled_date}T00:00`, event.timezone, "earlier")
            )
          : Date.parse(event.starts_at);
      const end =
        untimed && event.scheduled_date
          ? Date.parse(
              localDateTimeToIso(`${event.scheduled_date}T23:59`, event.timezone, "later")
            ) + 59999
          : Math.max(start, Date.parse(event.ends_at ?? event.starts_at));
      return Number.isFinite(start) && Number.isFinite(end) ? [{ start, end }] : [];
    } catch {
      return [];
    }
  });
  return bounds.length
    ? {
        start: Math.min(...bounds.map((event) => event.start)),
        end: Math.max(...bounds.map((event) => event.end))
      }
    : null;
}

export function isTripUnderway(events: ItineraryItem[], now = Date.now()): boolean {
  const span = itinerarySpan(events);
  return !!span && now >= span.start && now <= span.end;
}

/** Preparation/reminders can begin a trip before its travel dates. */
export function tripActivitySpan({
  tripId,
  events,
  requirements,
  reminders,
  timezone
}: {
  tripId: string;
  events: ItineraryItem[];
  requirements: Requirement[];
  reminders: Reminder[];
  timezone: string;
}): { start: number; end: number } | null {
  const eventSpan = itinerarySpan(events);
  const bounds = eventSpan ? [eventSpan] : [];
  const anchors = events.filter(
    (event) => !event.deleted_at && !["cancelled", "skipped"].includes(event.event_status ?? "")
  );
  for (const task of requirements) {
    if (task.trip_id !== tripId || task.status === "not_required") continue;
    try {
      const mode = task.timing_mode ?? (task.due_date ? "date_only" : "unscheduled");
      if (mode === "date_only" && task.due_date) {
        bounds.push({
          start: Date.parse(localDateTimeToIso(`${task.due_date}T00:00`, timezone, "earlier")),
          end: Date.parse(localDateTimeToIso(`${task.due_date}T23:59`, timezone, "later")) + 59999
        });
      } else {
        const schedule = requirementTimelineSchedule(task, anchors, timezone);
        const instant = schedule ? Date.parse(schedule.startsAt) : NaN;
        if (Number.isFinite(instant)) bounds.push({ start: instant, end: instant });
      }
    } catch {
      /* Invalid dates or missing anchors must not create an active trip. */
    }
  }
  for (const reminder of reminders) {
    if (reminder.trip_id !== tripId) continue;
    const instant = Date.parse(reminder.due_at);
    if (Number.isFinite(instant)) bounds.push({ start: instant, end: instant });
  }
  // Completed entries still establish when preparation started.
  return bounds.length
    ? {
        start: Math.min(...bounds.map((entry) => entry.start)),
        end: Math.max(...bounds.map((entry) => entry.end))
      }
    : null;
}
