export type ActivityMoment = {
  id: string;
  itinerary_item_id: string;
  moment_order: number;
  title: string;
  location: {
    label?: string;
    address?: string;
    map_url?: string;
  } | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  notes: string | null;
  source_planning_item_id: string | null;
  version?: number;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type ActivityMomentInput = {
  tripId: string;
  itineraryItemId: string;
  title: string;
  location?: string;
  mapUrl?: string;
  startsAt?: string;
  endsAt?: string;
  timezone: string;
  notes?: string;
  sourcePlanningItemId?: string;
  momentOrder?: number;
};

export type UpdateActivityMomentInput = ActivityMomentInput & {
  id: string;
  version?: number;
};
