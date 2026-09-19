import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeTripNavigationIntent,
  isTripRouteModal,
  isTripNavigationIntentConsumed,
  readTripEntry,
  readTripNavigationIntent,
  readTripReturnContext,
  readTripScrollRestore,
  tripChildScrollState,
  tripChildNavigationState,
  tripEntryNavigationState,
  tripIntentNavigationState,
  tripRouteModalNavigationState,
  tripReturnHref,
  tripReturnNavigation
} from "./navigation";

describe("trip navigation context", () => {
  beforeEach(() => sessionStorage.clear());

  it("carries a validated source view through a child page and back", () => {
    const childState = tripChildNavigationState({ caller: "test" }, "trip-1", "details");

    expect(readTripReturnContext(childState, "trip-1")).toEqual({
      tripId: "trip-1",
      view: "details"
    });
    expect(readTripReturnContext(childState, "another-trip")).toBeNull();

    const back = tripReturnNavigation(childState, "trip-1");
    expect(back.href).toBe("/trips/trip-1?view=details");
    expect(back.view).toBe("details");
    expect(readTripNavigationIntent(back.state, "trip-1")).toMatchObject({
      kind: "restore",
      view: "details"
    });
    expect((back.state as { caller?: string }).caller).toBe("test");
  });

  it("falls back to the timeline when return state belongs to another trip", () => {
    const foreignState = tripChildNavigationState(null, "trip-2", "details");

    const back = tripReturnNavigation(foreignState, "trip-1");

    expect(back.href).toBe("/trips/trip-1");
    expect(back.view).toBe("timeline");
    expect(readTripReturnContext(back.state, "trip-1")).toBeNull();
  });

  it("marks explicit intents as one-shot without losing the selected entry view", () => {
    const entryState = tripEntryNavigationState(null, "trip-1", "details");
    const state = tripIntentNavigationState(entryState, "trip-1", "search", { view: "timeline" });
    const intent = readTripNavigationIntent(state, "trip-1");

    expect(intent).not.toBeNull();
    expect(readTripEntry(state, "trip-1")).toEqual({ tripId: "trip-1", view: "timeline" });
    expect(intent && isTripNavigationIntentConsumed(intent)).toBe(false);
    if (!intent) throw new Error("Search intent was not created");
    consumeTripNavigationIntent(intent);
    expect(isTripNavigationIntentConsumed(intent)).toBe(true);
  });

  it("builds stable return URLs for both trip views", () => {
    expect(tripReturnHref("trip-1", "timeline")).toBe("/trips/trip-1");
    expect(tripReturnHref("trip-1", "details")).toBe("/trips/trip-1?view=details");
  });

  it("returns child pages to the exact route that opened them", () => {
    const eventPath = "/trips/trip-1?event=event-1";
    const childState = tripChildNavigationState(null, "trip-1", "timeline", eventPath);

    expect(tripReturnNavigation(childState, "trip-1")).toMatchObject({
      href: eventPath,
      view: "timeline",
      hasOrigin: true
    });
  });

  it("rejects a return path outside the current trip", () => {
    const childState = tripChildNavigationState(
      null,
      "trip-1",
      "timeline",
      "/trips/another-trip?event=event-1"
    );

    expect(tripReturnNavigation(childState, "trip-1")).toMatchObject({
      href: "/trips/trip-1",
      hasOrigin: false
    });
  });

  it("unwinds nested pages to their parent and then restores the original event modal", () => {
    const modalState = tripRouteModalNavigationState(null, "trip-1", "timeline");
    const bookingState = tripChildNavigationState(
      modalState,
      "trip-1",
      "timeline",
      "/trips/trip-1?event=event-1"
    );
    const documentState = tripChildNavigationState(
      bookingState,
      "trip-1",
      "timeline",
      "/trips/trip-1/bookings/booking-1"
    );
    const backToBooking = tripReturnNavigation(documentState, "trip-1");
    expect(backToBooking.href).toBe("/trips/trip-1/bookings/booking-1");
    const backToEvent = tripReturnNavigation(backToBooking.state, "trip-1");
    expect(backToEvent.href).toBe("/trips/trip-1?event=event-1");
    expect(isTripRouteModal(backToEvent.state, "trip-1")).toBe(false);
    expect(tripReturnNavigation(backToEvent.state, "trip-1").href).toBe("/trips/trip-1");
  });

  it("does not stack the same origin twice", () => {
    const path = "/trips/trip-1?event=event-1";
    const state = tripChildNavigationState(null, "trip-1", "details", path);
    const repeated = tripChildNavigationState(state, "trip-1", "details", path);
    const back = tripReturnNavigation(repeated, "trip-1");
    expect(back.href).toBe(path);
    expect(readTripReturnContext(back.state, "trip-1")).toBeNull();
  });

  it("preserves timeline position through event modal, booking, and both return steps", () => {
    const timelinePath = "/trips/trip-1";
    const eventPath = `${timelinePath}?event=event-1`;
    const scroll = { y: 1600, anchorId: "timeline-event-1", anchorOffset: 168 };
    const modalState = tripChildScrollState(
      tripChildNavigationState(
        tripRouteModalNavigationState(null, "trip-1", "timeline"),
        "trip-1",
        "timeline",
        timelinePath
      ),
      "trip-1",
      scroll
    );
    const bookingState = tripChildScrollState(
      tripChildNavigationState(modalState, "trip-1", "timeline", eventPath),
      "trip-1",
      scroll
    );
    const backToModal = tripReturnNavigation(bookingState, "trip-1");
    expect(backToModal.href).toBe(eventPath);
    expect(readTripScrollRestore(backToModal.state, "trip-1", eventPath)).toEqual(scroll);
    const backToTimeline = tripReturnNavigation(backToModal.state, "trip-1");
    expect(backToTimeline.href).toBe(timelinePath);
    expect(readTripScrollRestore(backToTimeline.state, "trip-1", timelinePath)).toEqual(scroll);
  });

  it("marks route-backed modal entries without losing their trip return view", () => {
    const state = tripRouteModalNavigationState(null, "trip-1", "details");

    expect(isTripRouteModal(state, "trip-1")).toBe(true);
    expect(isTripRouteModal(state, "trip-2")).toBe(false);
    expect(readTripReturnContext(state, "trip-1")).toEqual({
      tripId: "trip-1",
      view: "details"
    });
  });
});
