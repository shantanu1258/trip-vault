import {
  BedDouble,
  Bus,
  CalendarClock,
  CarTaxiFront,
  CircleEllipsis,
  CookingPot,
  MapPinned,
  Plane,
  Ship,
  TrainFront,
  type LucideIcon
} from "lucide-react";
import type { TimelineEventType } from "../features/trips/types";

type EventIconDefinition = {
  icon: LucideIcon;
  tone: string;
  toneClassName: string;
};

const eventIconDefinitions: Record<TimelineEventType, EventIconDefinition> = {
  flight: { icon: Plane, tone: "flight", toneClassName: "event-type-icon--flight" },
  train: { icon: TrainFront, tone: "train", toneClassName: "event-type-icon--train" },
  bus: { icon: Bus, tone: "bus", toneClassName: "event-type-icon--bus" },
  ferry: { icon: Ship, tone: "ferry", toneClassName: "event-type-icon--ferry" },
  cab: { icon: CarTaxiFront, tone: "cab", toneClassName: "event-type-icon--cab" },
  transport: {
    icon: CarTaxiFront,
    tone: "transport",
    toneClassName: "event-type-icon--transport"
  },
  hotel_check_in: { icon: BedDouble, tone: "hotel", toneClassName: "event-type-icon--hotel" },
  hotel_check_out: { icon: BedDouble, tone: "hotel", toneClassName: "event-type-icon--hotel" },
  meal: { icon: CookingPot, tone: "meal", toneClassName: "event-type-icon--meal" },
  activity: { icon: MapPinned, tone: "activity", toneClassName: "event-type-icon--activity" },
  preparation: {
    icon: CalendarClock,
    tone: "preparation",
    toneClassName: "event-type-icon--preparation"
  },
  custom: { icon: CircleEllipsis, tone: "custom", toneClassName: "event-type-icon--custom" }
};

export function eventIconTone(type: TimelineEventType) {
  return eventIconDefinitions[type].tone;
}

export function EventTypeIcon({
  type,
  className = "",
  iconClassName = "size-5"
}: {
  type: TimelineEventType;
  className?: string;
  iconClassName?: string;
}) {
  const definition = eventIconDefinitions[type];
  const Icon = definition.icon;
  return (
    <span
      aria-hidden="true"
      data-event-type={type}
      data-event-tone={definition.tone}
      className={`event-type-icon ${definition.toneClassName} ${className}`}
    >
      <Icon className={iconClassName} />
    </span>
  );
}
