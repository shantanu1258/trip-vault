import { useId, useState } from "react";
import { TimeZoneAutocomplete } from "../../components/TimeZoneAutocomplete";
import type { EventTimingMode, ItineraryItem, Trip } from "../trips/types";
import { isoToLocalDateTime, localDateTimeToIso } from "../trips/validation";
import { RequiredMark } from "../../components/RequiredMark";
import { FieldHelp } from "../../components/FieldHelp";

function text(form: FormData, name: string) {
  return String(form.get(name) ?? "").trim();
}

type DurationUnit = "minutes" | "hours" | "days";

function readDurationMinutes(form: FormData) {
  const raw = text(form, "durationValue");
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error("Duration must be greater than zero.");
  const unit = text(form, "durationUnit") || "minutes";
  if (!["minutes", "hours", "days"].includes(unit))
    throw new Error("Choose minutes, hours, or days for the duration.");
  const multiplier = unit === "days" ? 1_440 : unit === "hours" ? 60 : 1;
  const minutes = value * multiplier;
  if (!Number.isInteger(minutes))
    throw new Error("Duration must resolve to a whole number of minutes.");
  return minutes;
}

function durationInputValue(minutes?: number | null): { value: string; unit: DurationUnit } {
  if (!minutes) return { value: "", unit: "minutes" };
  if (minutes % 1_440 === 0) return { value: String(minutes / 1_440), unit: "days" };
  if (minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

function setDurationValidity(input: HTMLInputElement, unit: DurationUnit) {
  const multiplier = unit === "days" ? 1_440 : unit === "hours" ? 60 : 1;
  const value = input.valueAsNumber;
  input.setCustomValidity(
    !Number.isNaN(value) && value > 0 && !Number.isInteger(value * multiplier)
      ? "Use a duration that resolves to whole minutes."
      : ""
  );
}

function resolveExplicitSchedule(
  form: FormData,
  timezone: string,
  assertDate: (date: string) => void,
  startRequired: boolean
) {
  const startsLocal = text(form, "startsAt");
  const endsLocal = text(form, "endsAt");
  const durationMinutes = readDurationMinutes(form);
  if (!startsLocal) {
    if (startRequired) throw new Error("Add the event date and start time.");
    if (endsLocal) throw new Error("Add a start date and time before adding an end time.");
    return { hasExplicitStartTime: false, durationMinutes };
  }

  assertDate(startsLocal.slice(0, 10));
  if (endsLocal) assertDate(endsLocal.slice(0, 10));
  const occurrence = (text(form, "occurrence") || "automatic") as "automatic" | "earlier" | "later";
  const startsAt = localDateTimeToIso(startsLocal, timezone, occurrence);
  let endsAt = endsLocal ? localDateTimeToIso(endsLocal, timezone, occurrence) : undefined;
  if (endsAt && endsAt <= startsAt) throw new Error("End time must be after the start time.");

  const elapsedMinutes = endsAt
    ? Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000)
    : undefined;
  if (endsAt && durationMinutes !== undefined && elapsedMinutes !== durationMinutes)
    throw new Error("End time and duration do not match.");
  if (!endsAt && durationMinutes !== undefined) {
    endsAt = new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();
    assertDate(isoToLocalDateTime(endsAt, timezone).slice(0, 10));
  }

  return {
    startsAt,
    endsAt,
    scheduledDate: startsLocal.slice(0, 10),
    hasExplicitStartTime: true,
    durationMinutes: durationMinutes ?? elapsedMinutes
  };
}

export function readEventTiming(form: FormData, trip: Trip, itinerary: ItineraryItem[]) {
  const timingMode = (text(form, "timingMode") || "exact") as EventTimingMode;
  const timezone = text(form, "timezone") || trip.primary_timezone;
  const assertDate = (date: string) => {
    if (!date) throw new Error("Choose a date for this event.");
    if (date < trip.start_date || date > trip.end_date)
      throw new Error(`Choose a date between ${trip.start_date} and ${trip.end_date}.`);
  };
  if (timingMode === "unscheduled")
    return {
      timingMode,
      timezone,
      startsAt: localDateTimeToIso(`${trip.end_date}T23:59`, timezone),
      scheduledDate: undefined,
      isAllDay: false,
      hasExplicitStartTime: false
    };
  if (timingMode === "relative") {
    const anchorItineraryItemId = text(form, "anchorItineraryItemId");
    const anchor = itinerary.find((item) => item.id === anchorItineraryItemId);
    if (!anchor || ["relative", "unscheduled"].includes(anchor.timing_mode ?? "exact"))
      throw new Error("Choose a dated event to place this before or after.");
    const relativeTimezone =
      (text(form, "timezoneOverride") === "yes" ? text(form, "timezone") : "") ||
      text(form, "itemTimezone") ||
      anchor.timezone;
    const schedule = resolveExplicitSchedule(form, relativeTimezone, assertDate, false);
    return {
      timingMode,
      timezone: relativeTimezone,
      startsAt: schedule.startsAt ?? anchor.starts_at,
      endsAt: schedule.endsAt,
      scheduledDate: schedule.scheduledDate ?? anchor.scheduled_date ?? undefined,
      anchorItineraryItemId,
      relativePosition:
        text(form, "relativePosition") === "before" ? ("before" as const) : ("after" as const),
      isAllDay: false,
      hasExplicitStartTime: schedule.hasExplicitStartTime,
      durationMinutes: schedule.durationMinutes
    };
  }
  if (timingMode === "date_only" || timingMode === "all_day") {
    const scheduledDate = text(form, "scheduledDate");
    assertDate(scheduledDate);
    return {
      timingMode,
      timezone,
      startsAt: localDateTimeToIso(`${scheduledDate}T12:00`, timezone),
      scheduledDate,
      isAllDay: timingMode === "all_day",
      hasExplicitStartTime: false
    };
  }
  const schedule = resolveExplicitSchedule(form, timezone, assertDate, true);
  return { timingMode, timezone, ...schedule, startsAt: schedule.startsAt!, isAllDay: false };
}

export function furthestEventTimezone(itinerary: ItineraryItem[], fallback: string) {
  let furthest: ItineraryItem | undefined;
  let furthestAt = Number.NEGATIVE_INFINITY;
  itinerary.forEach((item) => {
    if (item.timing_mode === "unscheduled") return;
    const chronologicalAt = Date.parse(item.ends_at ?? item.starts_at);
    if (!Number.isFinite(chronologicalAt)) return;
    if (!furthest || chronologicalAt >= furthestAt) {
      furthest = item;
      furthestAt = chronologicalAt;
    }
  });
  return furthest?.timezone || fallback;
}

export function EventTimeZoneField({
  name = "timezone",
  value,
  localDefaultValue,
  label = "Event time zone",
  hint = "The latest scheduled event supplies the default. Choose Default / local or another zone when this event uses a different local clock."
}: {
  name?: string;
  value: string;
  localDefaultValue: string;
  label?: string;
  hint?: string;
}) {
  return (
    <div className="form-label">
      <FieldHelp label={label} required>
        {hint}
      </FieldHelp>
      <TimeZoneAutocomplete
        name={name}
        defaultValue={value}
        localDefaultValue={localDefaultValue}
        required
        aria-label={label}
      />
    </div>
  );
}

function ScheduleFields({
  startDefault,
  endDefault,
  durationMinutes,
  startRequired,
  trip
}: {
  startDefault: string;
  endDefault: string;
  durationMinutes?: number | null;
  startRequired: boolean;
  trip: Trip;
}) {
  const [start, setStart] = useState(startDefault);
  const duration = durationInputValue(durationMinutes);
  const [durationUnit, setDurationUnit] = useState<DurationUnit>(duration.unit);
  const durationHelpId = useId();
  const multiplier = durationUnit === "days" ? 1_440 : durationUnit === "hours" ? 60 : 1;
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="form-label">
        {startRequired ? (
          <>
            Starts
            <RequiredMark />
          </>
        ) : (
          "Start date & time (optional)"
        )}
        <input
          className="form-input"
          name="startsAt"
          type="datetime-local"
          min={`${trip.start_date}T00:00`}
          max={`${trip.end_date}T23:59`}
          value={start}
          onChange={(event) => setStart(event.target.value)}
          required={startRequired}
        />
      </label>
      <label className="form-label">
        {startRequired ? "Ends (optional)" : "End date & time (optional)"}
        <input
          className="form-input"
          name="endsAt"
          type="datetime-local"
          min={`${trip.start_date}T00:00`}
          max={`${trip.end_date}T23:59`}
          defaultValue={endDefault}
          disabled={!start}
        />
      </label>
      <label className="form-label">
        Duration (optional)
        <input
          className="form-input"
          name="durationValue"
          type="number"
          min={String(1 / multiplier)}
          step="any"
          inputMode="decimal"
          defaultValue={duration.value}
          aria-describedby={durationHelpId}
          onInput={(event) => setDurationValidity(event.currentTarget, durationUnit)}
          placeholder="Enter how long it may take"
        />
      </label>
      <label className="form-label">
        Duration unit
        <select
          className="form-input"
          name="durationUnit"
          value={durationUnit}
          onChange={(event) => {
            const unit = event.target.value as DurationUnit;
            setDurationUnit(unit);
            const input = event.currentTarget.form?.elements.namedItem("durationValue");
            if (input instanceof HTMLInputElement) setDurationValidity(input, unit);
          }}
        >
          <option value="minutes">Minutes</option>
          <option value="hours">Hours</option>
          <option value="days">Days</option>
        </select>
      </label>
      <p id={durationHelpId} className="-mt-2 text-xs leading-5 text-muted sm:col-span-2">
        Use any positive duration that resolves to a whole minute, such as 90 minutes or 1.5 hours.
      </p>
    </div>
  );
}

const timingModeOptions: Array<{ value: EventTimingMode; label: string }> = [
  { value: "exact", label: "Exact date and time" },
  { value: "date_only", label: "Date known, time undecided" },
  { value: "all_day", label: "All day" },
  { value: "relative", label: "Before or after another event" },
  { value: "unscheduled", label: "No date yet" }
];

function RelativePlacementFields({
  itinerary,
  item,
  positionName = "relativePosition",
  anchorName = "anchorItineraryItemId"
}: {
  itinerary: ItineraryItem[];
  item?: ItineraryItem;
  positionName?: string;
  anchorName?: string;
}) {
  const [relativePosition, setRelativePosition] = useState(item?.relative_position ?? "after");
  const [anchorItineraryItemId, setAnchorItineraryItemId] = useState(
    item?.anchor_itinerary_item_id ?? ""
  );
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="form-label">
        Position
        <select
          className="form-input"
          name={positionName}
          value={relativePosition}
          onChange={(event) => setRelativePosition(event.target.value as "before" | "after")}
        >
          <option value="before">Before</option>
          <option value="after">After</option>
        </select>
      </label>
      <label className="form-label">
        Event
        <RequiredMark />
        <select
          className="form-input"
          name={anchorName}
          value={anchorItineraryItemId}
          onChange={(event) => setAnchorItineraryItemId(event.target.value)}
          required
        >
          <option value="">Choose a dated event</option>
          {itinerary
            .filter(
              (candidate) =>
                candidate.id !== item?.id &&
                !["relative", "unscheduled"].includes(candidate.timing_mode ?? "exact")
            )
            .map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}

export function JourneyTimelinePlacementFields({
  itinerary,
  journeyLabel,
  item
}: {
  itinerary: ItineraryItem[];
  journeyLabel: string;
  item?: ItineraryItem;
}) {
  const [mode, setMode] = useState<"exact" | "relative">(
    item?.timing_mode === "relative" ? "relative" : "exact"
  );
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-extrabold">Timeline placement</legend>
      <label className="form-label mt-2">
        Place in timeline
        <select
          className="form-input"
          name="journeyTimingMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as "exact" | "relative")}
        >
          <option value="exact">Use {journeyLabel} departure time</option>
          <option value="relative">Before or after another event</option>
        </select>
      </label>
      {mode === "relative" && (
        <>
          <RelativePlacementFields
            itinerary={itinerary}
            item={item}
            positionName="journeyRelativePosition"
            anchorName="journeyAnchorItineraryItemId"
          />
          <p className="mt-3 text-xs leading-5 text-muted">
            This controls timeline order only. The entered local departure and arrival times stay
            attached to the {journeyLabel} booking.
          </p>
        </>
      )}
    </fieldset>
  );
}

export function TimingFields({
  trip,
  itinerary,
  item,
  allowedModes,
  defaultTimezone,
  showTimezone = true
}: {
  trip: Trip;
  itinerary: ItineraryItem[];
  item?: ItineraryItem;
  allowedModes?: EventTimingMode[];
  defaultTimezone?: string;
  showTimezone?: boolean;
}) {
  const availableModes = allowedModes?.length
    ? allowedModes
    : timingModeOptions.map((option) => option.value);
  const initialMode = item?.timing_mode ?? (item?.is_all_day ? "all_day" : "exact");
  const [mode, setMode] = useState<EventTimingMode>(
    availableModes.includes(initialMode) ? initialMode : availableModes[0]
  );
  const localStart = item
    ? isoToLocalDateTime(item.starts_at, item.timezone)
    : `${trip.start_date}T09:00`;
  const explicitStart =
    mode === "relative" && item?.has_explicit_start_time !== true ? "" : localStart;
  const localEnd = item?.ends_at ? isoToLocalDateTime(item.ends_at, item.timezone) : "";
  return (
    <fieldset className="rounded-2xl border border-line p-4">
      <legend className="px-1 text-sm font-extrabold">When does it happen?</legend>
      <label className="form-label mt-2">
        Timing
        <select
          className="form-input"
          name="timingMode"
          value={mode}
          onChange={(event) => setMode(event.target.value as EventTimingMode)}
        >
          {timingModeOptions
            .filter((option) => availableModes.includes(option.value))
            .map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
        </select>
      </label>
      {mode === "exact" && (
        <ScheduleFields
          startDefault={item?.timing_mode === "exact" || !item ? localStart : ""}
          endDefault={item?.timing_mode === "exact" ? localEnd : ""}
          durationMinutes={item?.timing_mode === "exact" ? item.duration_minutes : undefined}
          startRequired
          trip={trip}
        />
      )}
      {(mode === "date_only" || mode === "all_day") && (
        <label className="form-label mt-4">
          Date
          <RequiredMark />
          <input
            className="form-input"
            name="scheduledDate"
            type="date"
            min={trip.start_date}
            max={trip.end_date}
            defaultValue={item?.scheduled_date ?? localStart.slice(0, 10)}
            required
          />
        </label>
      )}
      {mode === "relative" && (
        <>
          <RelativePlacementFields itinerary={itinerary} item={item} />
          <fieldset className="mt-4 rounded-2xl border border-line/80 p-4">
            <legend className="px-1 text-xs font-black uppercase tracking-[.1em] text-muted">
              Optional schedule details
            </legend>
            <p className="mt-1 text-xs leading-5 text-muted">
              Keep the before/after order now. Add a duration, or add exact times whenever you know
              them.
            </p>
            <ScheduleFields
              startDefault={explicitStart}
              endDefault={item?.has_explicit_start_time === true ? localEnd : ""}
              durationMinutes={item?.duration_minutes}
              startRequired={false}
              trip={trip}
            />
          </fieldset>
        </>
      )}
      {mode === "unscheduled" && (
        <p className="mt-3 text-xs leading-5 text-muted">
          This stays in the Unscheduled section until you edit it and choose a date or position.
        </p>
      )}
      {showTimezone && (
        <div className="mt-4">
          <EventTimeZoneField
            value={item?.timezone ?? defaultTimezone ?? trip.primary_timezone}
            localDefaultValue={defaultTimezone ?? trip.primary_timezone}
            hint={
              item
                ? "Changing this keeps the entered local clock time and recalculates its exact instant."
                : undefined
            }
          />
        </div>
      )}
      <input type="hidden" name="timezoneOverride" value="yes" />
      <input type="hidden" name="itemTimezone" value={item?.timezone ?? ""} />
      <input type="hidden" name="occurrence" value="earlier" />
    </fieldset>
  );
}
