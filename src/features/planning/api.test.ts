import { describe, expect, it } from "vitest";
import type { ItineraryItem } from "../trips/types";
import {
  planningActivityInput,
  planningCabRouteInput,
  planningCabStopInputs,
  planningItemEventInput
} from "./api";
import type { PlanningItem, PlanningPromotionContext } from "./types";

const planningEvent: ItineraryItem = {
  id: "plan-1",
  trip_id: "trip-1",
  title: "Saturday plan",
  event_type: "preparation",
  starts_at: "2026-10-03T06:30:00.000Z",
  ends_at: null,
  timezone: "Asia/Kolkata",
  location: null,
  notes: null,
  applies_to_all_travelers: false,
  timing_mode: "date_only",
  scheduled_date: "2026-10-03",
  has_explicit_start_time: false,
  created_at: "2026-09-21T10:00:00.000Z"
};

const context: PlanningPromotionContext = {
  tripId: "trip-1",
  planningEvent,
  travelerIds: ["traveler-1"]
};

function planningItem(overrides: Partial<PlanningItem> = {}): PlanningItem {
  return {
    id: "item-1",
    planning_event_id: planningEvent.id,
    item_order: 100,
    kind: "activity",
    title: "National Museum",
    location: {
      label: "National Museum",
      address: "National Museum",
      map_url: "https://maps.example/museum"
    },
    starts_at: "2026-10-03T08:30:00.000Z",
    duration_minutes: 90,
    timezone: "Asia/Kolkata",
    notes: "Buy tickets at the door",
    linked_itinerary_item_id: null,
    promoted_at: null,
    ...overrides
  };
}

describe("planning promotion inputs", () => {
  it("prefills the normal event model from a planning item", () => {
    expect(planningItemEventInput(context, planningItem(), "activity")).toMatchObject({
      tripId: "trip-1",
      eventType: "activity",
      title: "National Museum",
      startsAt: "2026-10-03T08:30:00.000Z",
      endsAt: "2026-10-03T10:00:00.000Z",
      timezone: "Asia/Kolkata",
      location: "National Museum",
      mapUrl: "https://maps.example/museum",
      notes: "Buy tickets at the door",
      participantScope: "selected",
      travelerIds: ["traveler-1"],
      timingMode: "exact",
      scheduledDate: "2026-10-03",
      hasExplicitStartTime: true,
      durationMinutes: 90,
      eventStatus: "planned"
    });
  });

  it("uses the planning date without inventing a start time", () => {
    expect(
      planningItemEventInput(
        context,
        planningItem({ starts_at: null, duration_minutes: null }),
        "custom"
      )
    ).toMatchObject({
      startsAt: planningEvent.starts_at,
      timingMode: "date_only",
      scheduledDate: "2026-10-03",
      hasExplicitStartTime: false
    });
  });

  it("turns ordered places into pickup, intermediate stops, and drop-off", () => {
    const selected = [
      planningItem({
        id: "last",
        item_order: 300,
        title: "Dinner",
        location: { label: "Dinner restaurant" },
        starts_at: "2026-10-03T13:30:00.000Z"
      }),
      planningItem({ id: "first", item_order: 100, title: "Hotel" }),
      planningItem({ id: "middle", item_order: 200, title: "Museum" })
    ];
    const route = planningCabRouteInput(context, selected, "Old city cab");

    expect(route).toMatchObject({
      title: "Old city cab",
      mode: "cab",
      reservationState: "planned",
      participantScope: "selected",
      travelerIds: ["traveler-1"],
      legs: [
        {
          originName: "National Museum",
          destinationName: "Dinner restaurant",
          details: {
            kind: "cab",
            ride_type: "hourly",
            trip_shape: "one_way",
            final_dropoff: "Dinner restaurant"
          }
        }
      ]
    });

    expect(planningCabStopInputs(context, "cab-leg-1", selected)).toMatchObject([
      { journeyLegId: "cab-leg-1", stopOrder: 100, title: "Hotel" },
      { journeyLegId: "cab-leg-1", stopOrder: 200, title: "Museum" },
      { journeyLegId: "cab-leg-1", stopOrder: 300, title: "Dinner" }
    ]);
  });

  it("combines ordered plan items into one activity shell for Moments", () => {
    const selected = [
      planningItem({ id: "last", item_order: 200, title: "Sunset" }),
      planningItem({ id: "first", item_order: 100, title: "Museum" })
    ];

    expect(planningActivityInput(context, selected, "Museum afternoon")).toMatchObject({
      eventType: "activity",
      title: "Museum afternoon",
      startsAt: "2026-10-03T08:30:00.000Z",
      participantScope: "selected",
      travelerIds: ["traveler-1"],
      eventStatus: "planned"
    });
  });
});
