import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheEntity: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  localProfileId: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  update: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({
  supabase: { from: mocks.from }
}));

vi.mock("../sync/localSync", () => ({
  cacheEntity: mocks.cacheEntity,
  localProfileId: mocks.localProfileId,
  networkWithCache: vi.fn(),
  queueCreate: vi.fn(),
  queueDelete: vi.fn(),
  queueUpdate: vi.fn(),
  readEntityList: vi.fn()
}));

import { cleanupQueuedTripDocuments, createTrip, linkBookingToItineraryItem } from "./api";
import type { ItineraryItem } from "./types";

describe("trip creation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.localProfileId.mockResolvedValue("57468f77-4be5-498f-9995-a085db5dc334");
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  it("inserts without requesting a representation before the owner trigger completes", async () => {
    const trip = await createTrip({
      title: "October Trip",
      destination: "Singapore",
      startDate: "2099-09-26",
      endDate: "2099-10-12",
      timezone: "Asia/Kolkata",
      baseCurrency: "INR"
    });

    expect(mocks.from).toHaveBeenCalledWith("trips");
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: trip.id,
      created_by: "57468f77-4be5-498f-9995-a085db5dc334",
      title: "October Trip"
    }));
    expect(trip).toEqual(expect.objectContaining({ version: 1, deleted_at: null }));
    expect(mocks.cacheEntity).toHaveBeenCalledWith("trips", trip);
  });
});

describe("activity booking linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    const request = { eq: mocks.eq, select: mocks.select, maybeSingle: mocks.maybeSingle };
    mocks.update.mockReturnValue(request);
    mocks.eq.mockReturnValue(request);
    mocks.select.mockReturnValue(request);
    mocks.from.mockReturnValue({ update: mocks.update });
  });

  it("updates only the booking link and leaves the event fields and participants untouched", async () => {
    const item: ItineraryItem = {
      id: "activity-1",
      trip_id: "trip-1",
      booking_id: null,
      title: "Museum visit",
      event_type: "activity",
      starts_at: "2026-09-28T04:00:00.000Z",
      ends_at: "2026-09-28T06:00:00.000Z",
      timezone: "Asia/Dubai",
      location: { label: "Museum of the Future", map_url: "https://maps.example/museum" },
      notes: "Arrive early",
      applies_to_all_travelers: false,
      timing_mode: "exact",
      event_status: "planned",
      sort_key: "one",
      version: 7,
      created_at: "2026-09-01T00:00:00.000Z"
    };
    const linked = { ...item, booking_id: "booking-1", version: 8 };
    mocks.maybeSingle.mockResolvedValue({ data: linked, error: null });

    await expect(linkBookingToItineraryItem(item, "booking-1")).resolves.toEqual(linked);

    expect(mocks.from).toHaveBeenCalledWith("itinerary_items");
    expect(mocks.update).toHaveBeenCalledWith({ booking_id: "booking-1" });
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", "activity-1");
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "trip_id", "trip-1");
    expect(mocks.eq).toHaveBeenNthCalledWith(3, "version", 7);
    expect(mocks.cacheEntity).toHaveBeenCalledWith("itinerary:trip-1", linked);
  });

  it("keeps a committed booking link successful when the local cache write fails", async () => {
    const item: ItineraryItem = {
      id: "activity-1",
      trip_id: "trip-1",
      booking_id: null,
      title: "Museum visit",
      event_type: "activity",
      starts_at: "2026-09-28T04:00:00.000Z",
      ends_at: "2026-09-28T06:00:00.000Z",
      timezone: "Asia/Dubai",
      location: null,
      notes: null,
      applies_to_all_travelers: true,
      timing_mode: "exact",
      event_status: "planned",
      sort_key: "one",
      version: 7,
      created_at: "2026-09-01T00:00:00.000Z"
    };
    const linked = { ...item, booking_id: "booking-1", version: 8 };
    const cacheError = new Error("IndexedDB quota exceeded");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    mocks.maybeSingle.mockResolvedValue({ data: linked, error: null });
    mocks.cacheEntity.mockRejectedValueOnce(cacheError);

    await expect(linkBookingToItineraryItem(item, "booking-1")).resolves.toEqual(linked);

    expect(warn).toHaveBeenCalledWith(
      "Booking was attached, but the local itinerary cache could not be refreshed.",
      cacheError
    );
    warn.mockRestore();
  });
});

describe("queued legacy trip-document cleanup", () => {
  const rows = [
    { id: "cleanup-1", storage_path: "trips/trip-1/documents/doc-1/versions/version-1/ticket.pdf" },
    { id: "cleanup-2", storage_path: "trips/trip-1/documents/doc-2/versions/version-2/visa.pdf" }
  ];

  it("acknowledges queue rows only after every Storage object is removed", async () => {
    const removeObjects = vi.fn().mockResolvedValue({ error: null });
    const removeQueueRows = vi.fn().mockResolvedValue({ error: null });

    await cleanupQueuedTripDocuments(rows, removeObjects, removeQueueRows);

    expect(removeObjects).toHaveBeenCalledWith(rows.map((row) => row.storage_path));
    expect(removeQueueRows).toHaveBeenCalledWith(rows.map((row) => row.id));
    expect(removeObjects.mock.invocationCallOrder[0]).toBeLessThan(removeQueueRows.mock.invocationCallOrder[0]);
  });

  it("retains every queue row when Storage cleanup fails", async () => {
    const storageError = { message: "Storage is unavailable" };
    const removeObjects = vi.fn().mockResolvedValue({ error: storageError });
    const removeQueueRows = vi.fn();
    const warn = vi.fn();

    await cleanupQueuedTripDocuments(rows, removeObjects, removeQueueRows, warn);

    expect(removeQueueRows).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Trip deleted, but legacy document Storage cleanup will be retried later.",
      storageError
    );
  });

  it("retains every queue row when the Storage request itself throws", async () => {
    const transportError = new Error("Connection closed");
    const removeObjects = vi.fn().mockRejectedValue(transportError);
    const removeQueueRows = vi.fn();
    const warn = vi.fn();

    await cleanupQueuedTripDocuments(rows, removeObjects, removeQueueRows, warn);

    expect(removeQueueRows).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Trip deleted, but legacy document Storage cleanup will be retried later.",
      transportError
    );
  });
});
