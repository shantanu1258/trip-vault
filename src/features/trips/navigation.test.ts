import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeTripNavigationIntent,
  isTripNavigationIntentConsumed,
  readTripEntry,
  readTripNavigationIntent,
  readTripReturnContext,
  tripChildNavigationState,
  tripEntryNavigationState,
  tripIntentNavigationState,
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
});
