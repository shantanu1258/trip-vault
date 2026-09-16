import { afterEach, describe, expect, it, vi } from "vitest";
import { createCoalescedRefresh, queryRootsForRealtimeTable, suppressRealtimeRefresh } from "./RealtimeRefresh";

describe("createCoalescedRefresh", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns a burst of database changes into one query refresh", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createCoalescedRefresh(refresh, 400);

    for (let event = 0; event < 34; event += 1) scheduler.schedule();
    await vi.advanceTimersByTimeAsync(399);
    expect(refresh).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("cancels a pending refresh when the realtime subscription unmounts", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createCoalescedRefresh(refresh, 400);

    scheduler.schedule();
    scheduler.cancel();
    await vi.runAllTimersAsync();

    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes only query families affected by the changed tables", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createCoalescedRefresh(refresh, 400);

    scheduler.schedule(queryRootsForRealtimeTable("bookings"));
    scheduler.schedule(queryRootsForRealtimeTable("flight_legs"));
    await vi.advanceTimersByTimeAsync(400);

    expect(refresh).toHaveBeenCalledWith(["bookings", "booking", "flights", "flight"]);
  });

  it("does not refetch query families already updated from the mutation response", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const scheduler = createCoalescedRefresh(refresh, 400);
    suppressRealtimeRefresh(["bookings", "flights"], 1_200);

    scheduler.schedule(["bookings", "flights", "itinerary-participants"]);
    await vi.advanceTimersByTimeAsync(400);

    expect(refresh).toHaveBeenCalledWith(["itinerary-participants"]);
  });
});
