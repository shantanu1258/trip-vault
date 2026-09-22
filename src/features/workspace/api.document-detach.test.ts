import { beforeEach, expect, it, vi } from "vitest";
import type { VaultDocument } from "./types";
import type { ItineraryItem } from "../trips/types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  read: vi.fn(),
  queueUpsert: vi.fn(),
  profile: vi.fn(),
  rows: vi.fn(),
  pending: vi.fn(),
  put: vi.fn(),
  remove: vi.fn()
}));
vi.mock("../../lib/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
vi.mock("../sync/localSync", () => ({
  localProfileId: mocks.profile,
  readEntityList: mocks.read,
  cacheEntityList: vi.fn(),
  queueUpsert: mocks.queueUpsert
}));
vi.mock("../../lib/local-db/database", () => ({
  database: {
    outbox: {
      where: () => ({
        equals: () => ({ toArray: mocks.pending, filter: () => ({ toArray: mocks.pending }) })
      })
    },
    transaction: async (_mode: string, _table: unknown, action: () => Promise<void>) => action(),
    entities: {
      where: () => ({ equals: () => ({ toArray: mocks.rows }) }),
      put: mocks.put,
      delete: mocks.remove
    }
  }
}));
import { attachDocumentsToEvent, detachDocumentFromBooking } from "./api";

const document = {
  id: "doc",
  trip_id: "trip",
  booking_id: "booking",
  flight_leg_id: "flight",
  journey_leg_id: "leg",
  title: "Ticket",
  visibility: "private",
  traveler_ids: ["traveler"]
} as VaultDocument;
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  mocks.rpc.mockResolvedValue({ data: ["event"], error: null });
  mocks.profile.mockResolvedValue("user");
  mocks.rows.mockResolvedValue([]);
  mocks.pending.mockResolvedValue([]);
  mocks.read.mockResolvedValue([]);
});

it("detaches atomically and clears only this booking's cached links, preserving the file and unrelated associations", async () => {
  const entry = (entityType: string, id: string, data: unknown) => ({
    profileId: "user",
    entityType,
    id,
    data
  });
  mocks.rows.mockResolvedValue([
    entry("documents:trip", "doc", document),
    entry("documents", "doc", document),
    entry("event-documents:event", "event:doc", {
      itinerary_item_id: "event",
      document_id: "doc",
      document
    }),
    entry("trip-event-documents:trip", "event:doc", {
      itinerary_item_id: "event",
      document_id: "doc"
    }),
    entry("event-documents:other", "other:doc", {
      itinerary_item_id: "other",
      document_id: "doc",
      document
    }),
    entry("documents", "untouched", { ...document, id: "untouched" })
  ]);
  await detachDocumentFromBooking(document);
  expect(mocks.rpc).toHaveBeenCalledWith("detach_booking_document", {
    requested_document_id: "doc",
    requested_booking_id: "booking"
  });
  expect(mocks.remove.mock.calls).toEqual([
    [["user", "event-documents:event", "event:doc"]],
    [["user", "trip-event-documents:trip", "event:doc"]]
  ]);
  expect(mocks.put).toHaveBeenCalledTimes(3);
  expect(mocks.put).toHaveBeenCalledWith(
    expect.objectContaining({
      entityType: "documents",
      data: expect.objectContaining({
        booking_id: null,
        flight_leg_id: null,
        journey_leg_id: null,
        title: "Ticket",
        visibility: "private",
        traveler_ids: ["traveler"]
      })
    })
  );
  expect(mocks.put).toHaveBeenCalledWith(
    expect.objectContaining({
      entityType: "event-documents:other",
      data: expect.objectContaining({
        document_id: "doc",
        document: expect.objectContaining({ booking_id: null })
      })
    })
  );
});

it("does not alter caches on permission failures, missing migration, or offline attempts", async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "Forbidden" } });
  await expect(detachDocumentFromBooking(document)).rejects.toMatchObject({ code: "42501" });
  mocks.rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  await expect(detachDocumentFromBooking(document)).rejects.toThrow("BOOKING DOCUMENT DETACHMENT");
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  await expect(detachDocumentFromBooking(document)).rejects.toThrow("Connect");
  expect(mocks.rpc).toHaveBeenCalledTimes(2);
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.remove).not.toHaveBeenCalled();
});

it("requires pending offline associations to sync first so they cannot reattach a detached file", async () => {
  mocks.pending.mockResolvedValue([{ entityType: "event-documents:event", entityId: "event:doc" }]);
  await expect(detachDocumentFromBooking(document)).rejects.toThrow("pending changes");
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("reattaches soft-unlinked documents using an upsert online and in the offline queue", async () => {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn().mockResolvedValue({ data: [], error: null }),
    upsert: mocks.upsert
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  mocks.upsert.mockResolvedValue({ error: null });
  const item = { id: "event", trip_id: "trip" } as ItineraryItem;
  await attachDocumentsToEvent(item, [document.id]);
  expect(mocks.upsert).toHaveBeenCalledWith(
    [expect.objectContaining({ itinerary_item_id: "event", document_id: "doc", deleted_at: null })],
    { onConflict: "itinerary_item_id,document_id" }
  );
  Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  mocks.read.mockImplementation(async (key: string) =>
    key === "documents:trip" ? [document] : []
  );
  await attachDocumentsToEvent(item, [document.id]);
  expect(mocks.queueUpsert).toHaveBeenCalledWith(
    expect.objectContaining({
      table: "itinerary_item_documents",
      serverRow: expect.objectContaining({
        itinerary_item_id: "event",
        document_id: "doc",
        deleted_at: null
      })
    })
  );
});
