import { beforeEach, expect, it, vi } from "vitest";
import type { CreateCostInput, TripCost } from "./types";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  readEntityList: vi.fn(),
  queueCreate: vi.fn(),
  queueUpdate: vi.fn(),
  pending: vi.fn(),
  cacheEntity: vi.fn()
}));
vi.mock("../../lib/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("../../lib/local-db/database", () => ({
  database: { outbox: { where: () => ({ equals: () => ({ toArray: mocks.pending }) }) } }
}));
vi.mock("../sync/localSync", () => ({
  cacheEntity: mocks.cacheEntity,
  localProfileId: async () => "user-1",
  networkWithCache: vi.fn(),
  queueCreate: mocks.queueCreate,
  queueDelete: vi.fn(),
  queueUpdate: mocks.queueUpdate,
  readEntityList: mocks.readEntityList
}));
vi.mock("./participantSync", () => ({
  cacheParticipantAssignments: vi.fn(),
  queueBookingParticipantSync: vi.fn(),
  syncBookingParticipants: vi.fn()
}));
import { addTripCost, updateTripCost } from "./api";

const input: CreateCostInput = {
  tripId: "trip-1",
  title: "Receipt",
  category: "food",
  amountMinor: 5000,
  currencyCode: "INR",
  paymentStatus: "paid",
  documentId: "doc-1"
};
const cost: TripCost = {
  id: "cost-1",
  trip_id: "trip-1",
  title: "Receipt",
  category: "food",
  amount_minor: 5000,
  currency_code: "INR",
  payment_status: "paid",
  itinerary_item_id: null,
  document_id: "doc-1",
  notes: null,
  created_at: "",
  version: 3
};

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.pending.mockResolvedValue([]);
  mocks.readEntityList.mockResolvedValue([cost]);
  mocks.queueCreate.mockResolvedValue("create-cost");
});

it("rejects event-and-document combinations before writing, including retained links on edit", async () => {
  await expect(addTripCost({ ...input, itineraryItemId: "event-1" })).rejects.toThrow("not both");
  await expect(updateTripCost({ ...input, id: cost.id, bookingId: "booking-1" })).rejects.toThrow(
    "not both"
  );
  expect(mocks.from).not.toHaveBeenCalled();
  expect(mocks.queueCreate).not.toHaveBeenCalled();
});

it("blocks an unfinished online upload and orders offline costs after their document association", async () => {
  mocks.pending.mockResolvedValue([
    { operationId: "associate-document", profileId: "user-1" },
    { operationId: "other-profile", profileId: "other-user" }
  ]);
  await expect(addTripCost(input)).rejects.toThrow("still waiting to sync");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  const created = await addTripCost(input);
  expect(created.document_id).toBe("doc-1");
  expect(mocks.queueCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      table: "trip_costs",
      row: expect.objectContaining({ document_id: "doc-1", itinerary_item_id: null }),
      dependsOn: ["associate-document"]
    })
  );
  expect(mocks.from).not.toHaveBeenCalled();
});

it("persists a new document link and can explicitly clear it on an existing cost", async () => {
  const single = vi.fn().mockResolvedValue({ data: cost, error: null });
  const maybeSingle = vi
    .fn()
    .mockResolvedValue({ data: { ...cost, document_id: null }, error: null });
  const select = vi.fn().mockReturnValue({ single, maybeSingle });
  const eq = vi.fn();
  eq.mockReturnValue({ eq, select });
  const insert = vi.fn().mockReturnValue({ select });
  const update = vi.fn().mockReturnValue({ eq });
  const remove = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  mocks.from.mockReturnValue({ insert, update, delete: remove });
  await addTripCost(input);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ document_id: "doc-1" }));
  await updateTripCost({ ...input, id: cost.id, documentId: null, version: 3 });
  expect(update).toHaveBeenCalledWith(expect.objectContaining({ document_id: null }));
  expect(eq).toHaveBeenCalledWith("version", 3);
});
