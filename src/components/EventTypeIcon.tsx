import {
  BedDouble,
  Bus,
  CalendarClock,
  CarTaxiFront,
  CircleEllipsis,
  CookingPot,
  MapPinned,
  Plane,
  ShieldCheck,
  Ship,
  TrainFront,
  type LucideIcon
} from "lucide-react";
import type { TimelineEventType } from "../features/trips/types";

type EventIconDefinition = {
  icon: LucideIcon;
  tone: string;
};

const eventIconDefinitions: Record<TimelineEventType, EventIconDefinition> = {
  flight: { icon: Plane, tone: "flight" },
  train: { icon: TrainFront, tone: "train" },
  bus: { icon: Bus, tone: "bus" },
  ferry: { icon: Ship, tone: "ferry" },
  cab: { icon: CarTaxiFront, tone: "cab" },
  transport: { icon: CarTaxiFront, tone: "transport" },
  hotel_check_in: { icon: BedDouble, tone: "hotel" },
  hotel_check_out: { icon: BedDouble, tone: "hotel" },
  meal: { icon: CookingPot, tone: "meal" },
  activity: { icon: MapPinned, tone: "activity" },
  preparation: { icon: ShieldCheck, tone: "preparation" },
  custom: { icon: CircleEllipsis, tone: "custom" }
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
      className={`event-type-icon event-type-icon--${definition.tone} ${className}`}
    >
      <Icon className={iconClassName} />
    </span>
  );
}
