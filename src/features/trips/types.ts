export type TripStatus = "draft" | "upcoming" | "active" | "completed" | "archived";

export const timelineEventTypes = [
  "flight",
  "train",
  "bus",
  "ferry",
  "cab",
  "hotel_check_in",
  "hotel_check_out",
  "transport",
  "meal",
  "activity",
  "preparation",
  "custom"
] as const;
export type TimelineEventType = (typeof timelineEventTypes)[number];
export type EventTimingMode = "exact" | "date_only" | "all_day" | "relative" | "unscheduled";
export type EventStatus = "planned" | "done" | "skipped" | "cancelled";
export type ParticipantScope = "everyone" | "selected";

export const journeyTimelineEventTypes = ["flight", "train", "bus", "ferry", "cab"] as const;

export function isJourneyEventType(
  type: TimelineEventType | undefined
): type is (typeof journeyTimelineEventTypes)[number] {
  return Boolean(
    type && journeyTimelineEventTypes.includes(type as (typeof journeyTimelineEventTypes)[number])
  );
}

export type Trip = {
  id: string;
  title: string;
  destination_summary: string;
  start_date: string;
  end_date: string;
  primary_timezone: string;
  base_currency: string;
  expense_splitting_enabled?: boolean;
  status: TripStatus;
  version?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type ItineraryItem = {
  id: string;
  trip_id: string;
  booking_id?: string | null;
  title: string;
  event_type?: TimelineEventType;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  location: { label?: string; address?: string; map_url?: string } | null;
  notes: string | null;
  applies_to_all_travelers: boolean;
  is_all_day?: boolean;
  completed_at?: string | null;
  timing_mode?: EventTimingMode;
  scheduled_date?: string | null;
  anchor_itinerary_item_id?: string | null;
  relative_position?: "before" | "after" | null;
  has_explicit_start_time?: boolean;
  duration_minutes?: number | null;
  event_status?: EventStatus;
  sort_key?: string;
  version?: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export const costCategories = [
  "flight",
  "hotel",
  "transport",
  "activity",
  "food",
  "visa",
  "insurance",
  "other"
] as const;
export type CostCategory = (typeof costCategories)[number];
export type PaymentStatus = "planned" | "paid" | "refunded";

export type TripCost = {
  id: string;
  trip_id: string;
  booking_id?: string | null;
  itinerary_item_id: string | null;
  cab_stop_id?: string | null;
  title: string;
  category: CostCategory;
  amount_minor: number;
  currency_code: string;
  payment_status: PaymentStatus;
  paid_by_traveler_id?: string | null;
  participants?: CostParticipant[];
  notes: string | null;
  version?: number;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type CostParticipant = {
  traveler_id: string;
  share_amount_minor: number | null;
};

export type ArchivedTripItem = {
  id: string;
  kind: "event" | "booking" | "cost";
  title: string;
  archived_at: string;
};

export type Reminder = {
  id: string;
  trip_id: string | null;
  title: string;
  due_at: string;
  severity: "urgent" | "today" | "upcoming" | "information";
  completed_at: string | null;
};

export type AlertState = {
  alert_key: string;
  read_at: string | null;
  dismissed_at: string | null;
  snoozed_until: string | null;
};

export type TripDocument = {
  id: string;
  trip_id: string;
  title: string;
  category: string;
  purpose: string;
  short_label: string | null;
  visibility: string;
  updated_at: string;
  deleted_at?: string | null;
};

export type CreateTripInput = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  timezone: string;
  baseCurrency: string;
};

export type UpdateTripInput = CreateTripInput & {
  id: string;
  status: TripStatus;
  version?: number;
};

export type CreateItineraryInput = {
  tripId: string;
  bookingId?: string;
  eventType?: TimelineEventType;
  title: string;
  startsAt: string;
  endsAt?: string;
  timezone: string;
  location?: string;
  mapUrl?: string;
  notes?: string;
  participantScope?: ParticipantScope;
  travelerIds?: string[];
  isAllDay?: boolean;
  completedAt?: string | null;
  timingMode?: EventTimingMode;
  scheduledDate?: string;
  anchorItineraryItemId?: string;
  relativePosition?: "before" | "after";
  hasExplicitStartTime?: boolean;
  durationMinutes?: number;
  eventStatus?: EventStatus;
  sortKey?: string;
  dependsOn?: string[];
};

export type UpdateItineraryInput = CreateItineraryInput & { id: string; version?: number };

export type CreateCostInput = {
  tripId: string;
  bookingId?: string;
  itineraryItemId?: string;
  cabStopId?: string;
  title: string;
  category: CostCategory;
  amountMinor: number;
  currencyCode: string;
  paymentStatus: PaymentStatus;
  paidByTravelerId?: string;
  participantTravelerIds?: string[];
  notes?: string;
  dependsOn?: string[];
};

export type UpdateCostInput = CreateCostInput & { id: string; version?: number };
