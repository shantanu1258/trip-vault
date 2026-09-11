import { z } from "zod";
import { costCategories } from "./types";

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function currencyFractionDigits(currencyCode: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

export function amountStringToMinor(amount: string, currencyCode: string) {
  const fractionDigits = currencyFractionDigits(currencyCode);
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 10 ** fractionDigits + Number(fraction.padEnd(fractionDigits, "0") || 0);
}

function representedLocalValue(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(instant).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function localDateTimeCandidates(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !isValidTimeZone(timeZone)) throw new Error("Enter a valid date, time, and time zone.");

  const [, year, month, day, hour, minute] = match;
  const desired = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
  let candidate = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate)).map((part) => [part.type, part.value]));
    const represented = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    candidate += desired - represented;
  }

  const candidates = new Set<string>();
  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes += 15) {
    const instant = new Date(candidate + offsetMinutes * 60_000);
    if (representedLocalValue(instant, timeZone) === value) candidates.add(instant.toISOString());
  }
  return [...candidates].sort();
}

export function localDateTimeToIso(value: string, timeZone: string, occurrence: "automatic" | "earlier" | "later" = "automatic") {
  const candidates = localDateTimeCandidates(value, timeZone);
  if (!candidates.length) throw new Error(`${value.replace("T", " ")} does not exist in ${timeZone} because the clock changes. Choose another time.`);
  if (candidates.length > 1 && occurrence === "automatic") throw new Error(`${value.replace("T", " ")} occurs twice in ${timeZone}. Choose the earlier or later occurrence.`);
  return occurrence === "later" ? candidates[candidates.length - 1] : candidates[0];
}

export function defaultHotelCheckoutLocal(checkInLocal: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}$/.exec(checkInLocal);
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T11:00`;
}

export function localDateTimeMinusMinutes(value: string, minutes: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match || !Number.isInteger(minutes) || minutes < 0) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]) - minutes));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

export function hotelStayInstants(input: {
  checkInLocal: string;
  checkoutLocal: string;
  timeZone: string;
  checkInOccurrence?: "automatic" | "earlier" | "later";
  checkoutOccurrence?: "automatic" | "earlier" | "later";
}) {
  if (!input.checkInLocal) throw new Error("Add the hotel check-in date and time.");
  if (!input.checkoutLocal) throw new Error("Add the hotel checkout date and time.");
  const checkInAt = localDateTimeToIso(input.checkInLocal, input.timeZone, input.checkInOccurrence);
  const checkoutAt = localDateTimeToIso(input.checkoutLocal, input.timeZone, input.checkoutOccurrence);
  if (Date.parse(checkoutAt) <= Date.parse(checkInAt)) {
    throw new Error("Hotel checkout date and time must be after check-in.");
  }
  return { checkInAt, checkoutAt };
}

export function isoToLocalDateTime(value: string | null | undefined, timeZone: string) {
  if (!value || !isValidTimeZone(timeZone)) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export const tripFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give the trip a name.").max(120),
    destination: z.string().trim().min(1, "Add the destination.").max(180),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose an end date."),
    timezone: z.string().trim().refine(isValidTimeZone, "Enter a valid time zone, such as Asia/Kolkata."),
    baseCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code.")
  })
  .superRefine((value, context) => {
    if (value.endDate < value.startDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "End date cannot be before the start date." });
    }
  });

export const itineraryFormSchema = z
  .object({
    title: z.string().trim().min(1, "Name this itinerary item.").max(160),
    startsAt: z.string().min(1, "Choose a start time."),
    endsAt: z.string().optional(),
    location: z.string().trim().max(180).optional(),
    notes: z.string().trim().max(2000).optional()
  })
  .superRefine((value, context) => {
    if (value.endsAt && value.endsAt < value.startsAt) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End time cannot be before the start time." });
    }
  });

export const costFormSchema = z
  .object({
    title: z.string().trim().min(1, "Describe this cost.").max(160),
    category: z.enum(costCategories),
    amount: z.string().trim().min(1, "Enter an amount."),
    currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code."),
    paymentStatus: z.enum(["planned", "paid", "refunded"]),
    notes: z.string().trim().max(2000).optional()
  })
  .superRefine((value, context) => {
    const digits = currencyFractionDigits(value.currencyCode);
    const pattern = new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
    if (!pattern.test(value.amount) || Number(value.amount) < 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: digits === 0 ? "Enter zero or a positive whole amount." : `Enter zero or a positive amount with up to ${digits} decimal places.`
      });
    }
  });

export function firstValidationMessage(error: z.ZodError) {
  return error.issues[0]?.message ?? "Check the highlighted information and try again.";
}
