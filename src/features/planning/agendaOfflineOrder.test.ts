import { afterEach, expect, it, vi } from "vitest";
import type { PlanningItem } from "./types";
import type { ActivityMoment } from "../activity-moments/types";
const mocks = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  operations: [] as Record<string, any>[]
}));
vi.mock("../sync/localSync", () => ({
  readEntityList: async () => mocks.rows,
  networkWithCache: async () => mocks.rows,
  cacheEntity: async (_type: string, row: Record<string, unknown>) => {
    mocks.rows = mocks.rows.map((old) => (old.id === row.id ? row : old));
  },
  queueUpdate: async (input: Record<string, any>) => {
    mocks.rows = mocks.rows.map((old) => (old.id === input.row.id ? input.row : old));
    const operationId = `op-${mocks.operations.length + 1}`;
    mocks.operations.push({
      ...input,
      operationId,
      entityId: input.row.id,
      operation: "update",
      payload: { table: input.table },
      createdAt: operationId
    });
    return operationId;
  },
  localProfileId: async () => "me",
  queueCreate: vi.fn()
}));
vi.mock("../../lib/local-db/database", () => ({
  database: {
    outbox: {
      where: () => ({
        equals: (id: string) => ({
          filter: (predicate: (value: any) => boolean) => ({
            toArray: async () =>
              mocks.operations.filter((op) => op.entityId === id && predicate(op))
          })
        })
      })
    }
  }
}));
import { reorderPlanningItems, updatePlanningItem } from "./api";
import { reorderActivityMoments, updateActivityMoment } from "../activity-moments/api";
afterEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: true }));
it.each(["plan", "moment"])(
  "chains the %s swap and preserves versions for a subsequent offline edit",
  async (kind) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    mocks.operations = [];
    const orderKey = kind === "plan" ? "item_order" : "moment_order";
    mocks.rows = ["a", "b"].map((id, i) => ({
      id,
      title: id,
      version: 1,
      [orderKey]: (i + 1) * 100,
      planning_event_id: "parent",
      itinerary_item_id: "parent"
    }));
    const result =
      kind === "plan"
        ? await reorderPlanningItems(mocks.rows as unknown as PlanningItem[], "b", "up")
        : await reorderActivityMoments(mocks.rows as unknown as ActivityMoment[], "b", "up");
    expect(result.map((row) => row.id)).toEqual(["b", "a"]);
    expect(result.map((row) => row.version)).toEqual([3, 2]);
    expect(mocks.operations.map((op) => op.baseVersion)).toEqual([1, 1, 2]);
    expect(mocks.operations[1].dependsOn).toContain("op-1");
    expect(mocks.operations[2].dependsOn).toContain("op-2");
    if (kind === "plan")
      await updatePlanningItem({
        id: "b",
        planningEventId: "parent",
        kind: "place",
        title: "Updated",
        timezone: "UTC"
      });
    else
      await updateActivityMoment({
        id: "b",
        tripId: "trip",
        itineraryItemId: "parent",
        title: "Updated",
        timezone: "UTC"
      });
    expect(mocks.operations[3].baseVersion).toBe(3);
    expect(mocks.operations[3].dependsOn).toEqual(["op-3"]);
  }
);
