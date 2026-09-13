import { useState } from "react";
import { TimeZoneAutocomplete } from "../../components/TimeZoneAutocomplete";
import type { EventTimingMode, ItineraryItem, Trip } from "../trips/types";
import { isoToLocalDateTime, localDateTimeToIso } from "../trips/validation";

function text(form: FormData, name: string) { return String(form.get(name) ?? "").trim(); }

export function readEventTiming(form: FormData, trip: Trip, itinerary: ItineraryItem[]) {
  const timingMode = (text(form, "timingMode") || "exact") as EventTimingMode;
  const timezone = text(form, "timezone") || trip.primary_timezone;
  const occurrence = (text(form, "occurrence") || "automatic") as "automatic" | "earlier" | "later";
  const assertDate = (date: string) => {
    if (!date) throw new Error("Choose a date for this event.");
    if (date < trip.start_date || date > trip.end_date) throw new Error(`Choose a date between ${trip.start_date} and ${trip.end_date}.`);
  };
  if (timingMode === "unscheduled") return { timingMode, timezone, startsAt: localDateTimeToIso(`${trip.end_date}T23:59`, timezone), scheduledDate: undefined, isAllDay: false };
  if (timingMode === "relative") {
    const anchorItineraryItemId = text(form, "anchorItineraryItemId");
    const anchor = itinerary.find((item) => item.id === anchorItineraryItemId);
    if (!anchor || ["relative", "unscheduled"].includes(anchor.timing_mode ?? "exact")) throw new Error("Choose a dated event to place this before or after.");
    return { timingMode, timezone: anchor.timezone, startsAt: anchor.starts_at, scheduledDate: anchor.scheduled_date ?? undefined, anchorItineraryItemId, relativePosition: text(form, "relativePosition") === "before" ? "before" as const : "after" as const, isAllDay: false };
  }
  if (timingMode === "date_only" || timingMode === "all_day") {
    const scheduledDate = text(form, "scheduledDate");
    assertDate(scheduledDate);
    return { timingMode, timezone, startsAt: localDateTimeToIso(`${scheduledDate}T12:00`, timezone), scheduledDate, isAllDay: timingMode === "all_day" };
  }
  const startsLocal = text(form, "startsAt");
  if (!startsLocal) throw new Error("Add the event date and start time.");
  assertDate(startsLocal.slice(0, 10));
  const endsLocal = text(form, "endsAt");
  if (endsLocal) assertDate(endsLocal.slice(0, 10));
  const startsAt = localDateTimeToIso(startsLocal, timezone, occurrence);
  const endsAt = endsLocal ? localDateTimeToIso(endsLocal, timezone, occurrence) : undefined;
  if (endsAt && endsAt < startsAt) throw new Error("End time must be after the start time.");
  return { timingMode, timezone, startsAt, endsAt, scheduledDate: startsLocal.slice(0, 10), isAllDay: false };
}

export function TimingFields({ trip, itinerary, item }: { trip: Trip; itinerary: ItineraryItem[]; item?: ItineraryItem }) {
  const [mode, setMode] = useState<EventTimingMode>(item?.timing_mode ?? (item?.is_all_day ? "all_day" : "exact"));
  const localStart = item ? isoToLocalDateTime(item.starts_at, item.timezone) : `${trip.start_date}T09:00`;
  return <fieldset className="rounded-2xl border border-line p-4">
    <legend className="px-1 text-sm font-extrabold">When does it happen?</legend>
    <label className="form-label mt-2">Timing<select className="form-input" name="timingMode" value={mode} onChange={(event) => setMode(event.target.value as EventTimingMode)}>
      <option value="exact">Exact date and time</option><option value="date_only">Date known, time undecided</option><option value="all_day">All day</option><option value="relative">Before or after another event</option><option value="unscheduled">No date yet</option>
    </select></label>
    {mode === "exact" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Starts<input className="form-input" name="startsAt" type="datetime-local" min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} defaultValue={localStart} required /></label><label className="form-label">Ends (optional)<input className="form-input" name="endsAt" type="datetime-local" min={`${trip.start_date}T00:00`} max={`${trip.end_date}T23:59`} defaultValue={item?.ends_at ? isoToLocalDateTime(item.ends_at, item.timezone) : ""} /></label></div>}
    {(mode === "date_only" || mode === "all_day") && <label className="form-label mt-4">Date<input className="form-input" name="scheduledDate" type="date" min={trip.start_date} max={trip.end_date} defaultValue={item?.scheduled_date ?? localStart.slice(0, 10)} required /></label>}
    {mode === "relative" && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Position<select className="form-input" name="relativePosition" defaultValue={item?.relative_position ?? "after"}><option value="before">Before</option><option value="after">After</option></select></label><label className="form-label">Event<select className="form-input" name="anchorItineraryItemId" defaultValue={item?.anchor_itinerary_item_id ?? ""} required><option value="">Choose a dated event</option>{itinerary.filter((candidate) => candidate.id !== item?.id && !["relative", "unscheduled"].includes(candidate.timing_mode ?? "exact")).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.title}</option>)}</select></label></div>}
    {mode === "unscheduled" && <p className="mt-3 text-xs leading-5 text-muted">This stays in the Unscheduled section until you edit it and choose a date or position.</p>}
    {!['relative', 'unscheduled'].includes(mode) && <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="form-label">Place time zone<TimeZoneAutocomplete name="timezone" defaultValue={item?.timezone ?? trip.primary_timezone} required /></label>{mode === "exact" && <label className="form-label">Repeated clock time<select className="form-input" name="occurrence" defaultValue="automatic"><option value="automatic">Automatic (usual)</option><option value="earlier">Earlier occurrence</option><option value="later">Later occurrence</option></select></label>}</div>}
    {['relative', 'unscheduled'].includes(mode) && <input type="hidden" name="timezone" value={trip.primary_timezone} />}
  </fieldset>;
}
