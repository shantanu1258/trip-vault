import { expect, it } from "vitest";
import type { ItineraryItem, Reminder } from "../trips/types";
import type { Requirement } from "./types";
import { isTripUnderway, tripActivitySpan } from "./activeTrip";

const event = (values: Partial<ItineraryItem>) =>
  ({
    starts_at: "2026-09-23T08:00:00Z",
    ends_at: "2026-09-23T12:00:00Z",
    timezone: "Asia/Kolkata",
    timing_mode: "exact",
    ...values
  }) as ItineraryItem;
it("starts at the earliest preparation/reminder, retaining completed entries and ignoring unrelated reminders", () => {
  const input = {
    tripId: "trip",
    timezone: "Asia/Kolkata",
    events: [event({ id: "flight" })],
    requirements: [],
    reminders: [
      {
        id: "r1",
        trip_id: "trip",
        due_at: "2026-09-21T08:00:00Z",
        completed_at: "2026-09-21T09:00:00Z"
      },
      { trip_id: null, due_at: "2026-08-01T08:00:00Z" },
      { trip_id: "another-trip", due_at: "2026-08-01T08:00:00Z" }
    ] as Reminder[]
  };
  expect(tripActivitySpan(input)).toEqual({
    start: Date.parse("2026-09-21T08:00:00Z"),
    end: Date.parse("2026-09-23T12:00:00Z")
  });
  expect(
    tripActivitySpan({
      ...input,
      requirements: [
        { trip_id: "trip", status: "complete", due_date: "2026-09-20", timing_mode: "date_only" }
      ] as Requirement[]
    })?.start
  ).toBe(Date.parse("2026-09-19T18:30:00Z"));
});
it("resolves relative preparation reminders and ignores unscheduled or not-required tasks", () => {
  const task = {
    trip_id: "trip",
    status: "required",
    timing_mode: "relative",
    anchor_itinerary_item_id: "flight",
    relative_position: "before",
    offset_minutes: 2880
  } as Requirement;
  const input = {
    tripId: "trip",
    timezone: "Asia/Kolkata",
    events: [event({ id: "flight" })],
    requirements: [task],
    reminders: []
  };
  expect(tripActivitySpan(input)?.start).toBe(Date.parse("2026-09-21T08:00:00Z"));
  expect(
    tripActivitySpan({
      ...input,
      requirements: [
        { ...task, status: "not_required" },
        { ...task, timing_mode: "unscheduled" }
      ]
    })?.start
  ).toBe(Date.parse("2026-09-23T08:00:00Z"));
  expect(
    tripActivitySpan({ ...input, events: [event({ id: "flight", event_status: "cancelled" })] })
  ).toBeNull();
});
it("uses first-to-last itinerary bounds, including gaps and completed first events", () => {
  const events = [
    event({ event_status: "done" }),
    event({ starts_at: "2026-09-25T08:00:00Z", ends_at: "2026-09-25T10:00:00Z" })
  ];
  expect(isTripUnderway(events, Date.parse("2026-09-24T08:00:00Z"))).toBe(true);
  expect(isTripUnderway(events, Date.parse("2026-09-23T07:59:59Z"))).toBe(false);
  expect(isTripUnderway(events, Date.parse("2026-09-25T10:00:01Z"))).toBe(false);
  expect(
    isTripUnderway(
      [
        event({ event_status: "cancelled" }),
        event({ deleted_at: "now" }),
        event({ timing_mode: "unscheduled" })
      ],
      Date.parse("2026-09-23T10:00:00Z")
    )
  ).toBe(false);
});
it("uses the local calendar day for untimed events without treating invalid/empty schedules as active", () => {
  const day = event({ timing_mode: "date_only", scheduled_date: "2026-09-23" });
  expect(isTripUnderway([day], Date.parse("2026-09-22T19:00:00Z"))).toBe(true);
  expect(isTripUnderway([day], Date.parse("2026-09-23T19:00:00Z"))).toBe(false);
  expect(isTripUnderway([event({ starts_at: "invalid" })])).toBe(false);
  expect(isTripUnderway([])).toBe(false);
});
