import type { ItineraryItem, TimelineEventType } from "../trips/types";

export const planningItemKinds = [
  "place",
  "meal",
  "activity",
  "transport",
  "free_time",
  "note"
] as const;

export type PlanningItemKind = (typeof planningItemKinds)[number];
export type PlanningPromotionType = Extract<
  TimelineEventType,
  "activity" | "meal" | "transport" | "custom"
>;

export type PlanningItem = {
  id: string;
  planning_event_id: string;
  item_order: number;
  kind: PlanningItemKind;
  title: string;
  location: {
    label?: string;
    address?: string;
    map_url?: string;
  } | null;
  starts_at: string | null;
  duration_minutes: number | null;
  timezone: string;
  notes: string | null;
  linked_itinerary_item_id: string | null;
  promoted_at: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type PlanningItemInput = {
  planningEventId: string;
  kind: PlanningItemKind;
  title: string;
  location?: string;
  mapUrl?: string;
  startsAt?: string;
  durationMinutes?: number;
  timezone: string;
  notes?: string;
  itemOrder?: number;
};

export type UpdatePlanningItemInput = PlanningItemInput & {
  id: string;
  version?: number;
};

export type PlanningPromotionContext = {
  tripId: string;
  planningEvent: ItineraryItem;
  travelerIds: string[];
};
