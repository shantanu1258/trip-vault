import {
  BedDouble,
  Bus,
  CalendarClock,
  CarTaxiFront,
  CookingPot,
  MapPinned,
  Plane,
  Ship,
  TrainFront,
  type LucideIcon
} from "lucide-react";
import { formatDurationMinutes } from "../../lib/formatDuration";
import type { Booking, BookingType } from "./types";

type BookingAppearance = {
  label: string;
  icon: LucideIcon;
  tone: string;
  start: string;
  end: string;
  countdown: string;
};
export const bookingAppearance: Record<BookingType, BookingAppearance> = {
  flight: {
    label: "Flight",
    icon: Plane,
    tone: "flight",
    start: "Departure",
    end: "Arrival",
    countdown: "departure"
  },
  hotel: {
    label: "Hotel",
    icon: BedDouble,
    tone: "hotel",
    start: "Check-in",
    end: "Check-out",
    countdown: "check-in"
  },
  train: {
    label: "Train",
    icon: TrainFront,
    tone: "train",
    start: "Departure",
    end: "Arrival",
    countdown: "departure"
  },
  bus: {
    label: "Bus",
    icon: Bus,
    tone: "bus",
    start: "Departure",
    end: "Arrival",
    countdown: "departure"
  },
  ferry: {
    label: "Ferry",
    icon: Ship,
    tone: "ferry",
    start: "Departure",
    end: "Arrival",
    countdown: "sailing"
  },
  cab: {
    label: "Cab",
    icon: CarTaxiFront,
    tone: "cab",
    start: "Pickup",
    end: "Drop-off",
    countdown: "pickup"
  },
  transport: {
    label: "Transport",
    icon: CarTaxiFront,
    tone: "transport",
    start: "Starts",
    end: "Ends",
    countdown: "departure"
  },
  activity: {
    label: "Activity",
    icon: MapPinned,
    tone: "activity",
    start: "Entry",
    end: "Ends",
    countdown: "start"
  },
  restaurant: {
    label: "Restaurant",
    icon: CookingPot,
    tone: "meal",
    start: "Reservation",
    end: "Ends",
    countdown: "reservation"
  },
  other: {
    label: "Booking",
    icon: CalendarClock,
    tone: "custom",
    start: "Starts",
    end: "Ends",
    countdown: "start"
  }
};

export function bookingCountdown(
  booking: Booking,
  start: string | null | undefined,
  now = new Date()
) {
  if (!start) return null;
  const minutes = Math.ceil((Date.parse(start) - now.getTime()) / 60000);
  if (!Number.isFinite(minutes)) return null;
  const label = bookingAppearance[booking.type].countdown;
  return minutes > 0
    ? `${formatDurationMinutes(minutes)} to ${label}`
    : `${label[0].toUpperCase()}${label.slice(1)} time passed`;
}
