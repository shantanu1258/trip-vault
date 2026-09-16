import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeTripNavigationIntent,
  isTripRouteModal,
  isTripNavigationIntentConsumed,
  readTripEntry,
  readTripNavigationIntent,
  readTripReturnContext,
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
      historyBack: true
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
      historyBack: false
    });
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
