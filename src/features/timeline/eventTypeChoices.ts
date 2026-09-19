import type { TimelineEventType } from "../trips/types";

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
  { type: "preparation", label: "Preparation", hint: "A dated or flexible pre-trip task" },
  { type: "transport", label: "Other transport", hint: "Metro, rental, transfer, or walk" },
  { type: "custom", label: "Other", hint: "Anything else on the timeline" }
];

export function timelineFilterType(type: TimelineEventType | null | undefined) {
  return type === "hotel_check_out" ? "hotel_check_in" : (type ?? "custom");
}
