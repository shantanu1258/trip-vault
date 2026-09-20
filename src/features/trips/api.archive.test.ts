import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("../../lib/supabase/client", () => ({ supabase: mocks }));
import { deleteArchivedTripItem, listArchivedTripItems, restoreArchivedTripItem } from "./api";
import type { ArchivedTripItem } from "./types";
const task: ArchivedTripItem = {
  id: "task",
  kind: "task",
  title: "Visa",
  archived_at: "2026-09-20"
};
function query(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq", "not", "update", "order"]) builder[key] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn().mockResolvedValue(result);
  builder.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
  return builder as Record<string, ReturnType<typeof vi.fn>>;
}
describe("archived trip items API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });
  it("includes tasks and notes, deduplicates booking events, and sorts by archive time", async () => {
    const rows: Record<string, unknown[]> = {
      itinerary_items: [
        { id: "checkin", title: "Stay", booking_id: "booking", deleted_at: "2026-09-18" },
        { id: "checkout", title: "Stay checkout", booking_id: "booking", deleted_at: "2026-09-18" }
      ],
      trip_costs: [{ id: "cost", title: "Taxi", deleted_at: "2026-09-19" }],
      trip_requirements: [{ id: "task", title: "Visa", deleted_at: "2026-09-20" }],
      notes: [{ id: "note", title: null, deleted_at: "2026-09-17" }]
    };
    const builders = Object.fromEntries(
      Object.entries(rows).map(([table, data]) => [table, query({ data, error: null })])
    );
    mocks.from.mockImplementation((table: string) => builders[table]);
    const items = await listArchivedTripItems("trip");
    expect(items.map((item) => item.kind)).toEqual(["task", "cost", "booking", "note"]);
    for (const builder of Object.values(builders)) {
      expect(builder.eq).toHaveBeenCalledWith("trip_id", "trip");
      expect(builder.not).toHaveBeenCalledWith("deleted_at", "is", null);
    }
  });
  it("restores only an archived task in the specified trip without changing completion", async () => {
    const builder = query({ data: { id: task.id }, error: null });
    mocks.from.mockReturnValue(builder);
    await restoreArchivedTripItem(task, "trip");
    expect(mocks.from).toHaveBeenCalledWith("trip_requirements");
    expect(builder.update).toHaveBeenCalledWith({ deleted_at: null });
    expect(builder.eq).toHaveBeenCalledWith("trip_id", "trip");
    expect(builder.not).toHaveBeenCalledWith("deleted_at", "is", null);
    builder.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(restoreArchivedTripItem(task, "trip")).rejects.toThrow("no longer archived");
  });
  it("uses the archive-only RPC and surfaces migration and permission failures", async () => {
    mocks.rpc.mockResolvedValue({ error: null });
    await deleteArchivedTripItem(task, "trip");
    expect(mocks.rpc).toHaveBeenCalledWith("delete_archived_trip_item", {
      requested_trip_id: "trip",
      requested_item_id: "task",
      requested_kind: "task"
    });
    mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
    await expect(deleteArchivedTripItem(task, "trip")).rejects.toThrow("migration");
    const denied = { message: "You cannot delete items from this trip" };
    mocks.rpc.mockResolvedValue({ error: denied });
    await expect(deleteArchivedTripItem(task, "trip")).rejects.toEqual(denied);
  });
  it("never sends archive mutations offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await expect(listArchivedTripItems("trip")).resolves.toEqual([]);
    await expect(restoreArchivedTripItem(task, "trip")).rejects.toThrow("Connect");
    await expect(deleteArchivedTripItem(task, "trip")).rejects.toThrow("Connect");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
