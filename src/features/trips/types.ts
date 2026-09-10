export type TripStatus = "draft" | "upcoming" | "active" | "completed" | "archived";

export type Trip = {
  id: string;
  title: string;
  destination_summary: string;
  start_date: string;
  end_date: string;
  primary_timezone: string;
  base_currency: string;
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
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  location: { label?: string } | null;
  notes: string | null;
  applies_to_all_travelers: boolean;
  is_all_day?: boolean;
  sort_key?: string;
  version?: number;
  created_at: string;
  updated_at?: string;
};

export const costCategories = ["flight", "hotel", "transport", "activity", "food", "visa", "insurance", "other"] as const;
export type CostCategory = (typeof costCategories)[number];
export type PaymentStatus = "planned" | "paid" | "refunded";

export type TripCost = {
  id: string;
  trip_id: string;
  itinerary_item_id: string | null;
  title: string;
  category: CostCategory;
  amount_minor: number;
  currency_code: string;
  payment_status: PaymentStatus;
  notes: string | null;
  version?: number;
  created_at: string;
  updated_at?: string;
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

export type UpdateTripInput = CreateTripInput & { id: string; status: TripStatus; version?: number };

export type CreateItineraryInput = {
  tripId: string;
  bookingId?: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  timezone: string;
  location?: string;
  notes?: string;
  travelerIds?: string[];
  isAllDay?: boolean;
};

export type UpdateItineraryInput = CreateItineraryInput & { id: string; version?: number };

export type CreateCostInput = {
  tripId: string;
  title: string;
  category: CostCategory;
  amountMinor: number;
  currencyCode: string;
  paymentStatus: PaymentStatus;
  notes?: string;
};

export type UpdateCostInput = CreateCostInput & { id: string; version?: number };
