import type { TimelineEventType } from "../trips/types";
import type { BookingType } from "../workspace/types";

/** Shared labels and order for adding and filtering timeline events. */
export const eventTypeChoices: { type: TimelineEventType; label: string; hint: string }[] = [
  { type: "flight", label: "Flight", hint: "Direct or connected flights" },
  { type: "hotel_check_in", label: "Hotel", hint: "A stay with check-in and checkout" },
  { type: "activity", label: "Activity", hint: "Visit, tour, ticket, or free time" },
  { type: "bus", label: "Bus", hint: "Coach, shuttle, or local bus" },
  { type: "cab", label: "Cab", hint: "Local ride, transfer, or outstation" },
  { type: "ferry", label: "Ferry / boat", hint: "Passenger or vehicle sailing" },
  { type: "train", label: "Train", hint: "Rail plan, ticket, or connection" },
  { type: "meal", label: "Meal", hint: "Lunch, dinner, or reservation" },
  { type: "preparation", label: "Planning", hint: "Plan the day, tasks, or things to arrange" },
  { type: "transport", label: "Other transport", hint: "Metro, rental, transfer, or walk" },
  { type: "custom", label: "Other", hint: "Anything else on the timeline" }
];

export function timelineFilterType(type: TimelineEventType | null | undefined) {
  return type === "hotel_check_out" ? "hotel_check_in" : (type ?? "custom");
}

const eventTypeSearchAliases: Record<TimelineEventType, string> = {
  flight: "flights plane planes",
  hotel_check_in: "hotels stay stays check-in check in checkin",
  hotel_check_out: "hotels stay stays check-out check out checkout",
  activity: "activities visit visits tour tours",
  bus: "buses coach coaches shuttle shuttles",
  cab: "cabs taxi taxis",
  ferry: "ferries boat boats sailing sailings",
  train: "trains rail railway",
  meal: "meals restaurant restaurants breakfast lunch dinner",
  preparation:
    "planning plan plans agenda checklist todo to-do preparation preparations task tasks prep",
  transport: "transportation transfer transfers metro rental walk",
  custom: "other custom"
};

/** Match the same visible type labels used by Add event, plus common equivalents. */
export function eventTypeSearchTerms(type: TimelineEventType | BookingType | null | undefined) {
  const eventType =
    type === "hotel"
      ? "hotel_check_in"
      : type === "restaurant"
        ? "meal"
        : type === "other"
          ? "custom"
          : (type ?? "custom");
  const label = eventTypeChoices.find(
    (choice) => choice.type === timelineFilterType(eventType)
  )?.label;
  return [type, eventType.replaceAll("_", " "), label, eventTypeSearchAliases[eventType]].join(" ");
}
