export type DurationFormatStyle = "short" | "long";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

function durationPart(value: number, short: string, singular: string, plural: string) {
  return `${value}${short ? short : ` ${value === 1 ? singular : plural}`}`;
}

/**
 * Formats display-only durations consistently across the app.
 * Exactly 24 hours remains hours; durations over 24 hours use days. Exactly
 * seven days remains days; durations over seven days use weeks.
 */
export function formatDurationMinutes(
  minutes: number,
  options: { style?: DurationFormatStyle; zeroLabel?: string } = {}
) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  if (safeMinutes === 0)
    return options.zeroLabel ?? (options.style === "long" ? "0 minutes" : "0m");

  const useWeeks = safeMinutes > MINUTES_PER_WEEK;
  const useDays = !useWeeks && safeMinutes > MINUTES_PER_DAY;
  const weeks = useWeeks ? Math.floor(safeMinutes / MINUTES_PER_WEEK) : 0;
  const afterWeeks = useWeeks ? safeMinutes % MINUTES_PER_WEEK : safeMinutes;
  const days = useWeeks || useDays ? Math.floor(afterWeeks / MINUTES_PER_DAY) : 0;
  const afterDays = useWeeks || useDays ? afterWeeks % MINUTES_PER_DAY : afterWeeks;
  const hours = Math.floor(afterDays / MINUTES_PER_HOUR);
  const remainder = afterDays % MINUTES_PER_HOUR;
  const short = options.style !== "long";

  return [
    weeks ? durationPart(weeks, short ? "w" : "", "week", "weeks") : "",
    days ? durationPart(days, short ? "d" : "", "day", "days") : "",
    hours ? durationPart(hours, short ? "h" : "", "hour", "hours") : "",
    remainder ? durationPart(remainder, short ? "m" : "", "minute", "minutes") : ""
  ]
    .filter(Boolean)
    .join(" ");
}

export function formatDurationBetween(
  start: string | Date,
  end: string | Date,
  options?: { style?: DurationFormatStyle; zeroLabel?: string }
) {
  return formatDurationMinutes(
    (new Date(end).getTime() - new Date(start).getTime()) / 60_000,
    options
  );
}
