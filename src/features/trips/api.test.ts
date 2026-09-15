import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheEntity: vi.fn(),
  eq: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  localProfileId: vi.fn(),
  maybeSingle: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  syncBookingParticipants: vi.fn(),
  cacheParticipantAssignments: vi.fn()
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

vi.mock("./participantSync", () => ({
  syncBookingParticipants: mocks.syncBookingParticipants,
  cacheParticipantAssignments: mocks.cacheParticipantAssignments,
  queueBookingParticipantSync: vi.fn()
}));

import { cleanupQueuedTripDocuments, createTrip, deleteTripPermanently, linkBookingToItineraryItem } from "./api";
import type { ItineraryItem, Trip } from "./types";

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

describe("temporary permanent trip deletion", () => {
  it("selects document versions through the parent-document relationship explicitly", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.localProfileId.mockResolvedValue("owner-user");
    const relationshipError = new Error("stop after checking the relationship");
    const versionSelect = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: relationshipError }) });
    mocks.from.mockImplementation((table: string) => {
      if (table === "trip_members") return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: vi.fn().mockResolvedValue({ data: { role: "owner" }, error: null }) }) }) }) };
      if (table === "document_versions") return { select: versionSelect };
      throw new Error(`Unexpected table ${table}`);
    });
    const trip: Trip = {
      id: "trip-1", title: "Test trip", destination_summary: "Dubai", start_date: "2026-09-20", end_date: "2026-09-25",
      primary_timezone: "Asia/Kolkata", base_currency: "INR", status: "upcoming", created_at: "", updated_at: ""
    };

    await expect(deleteTripPermanently(trip)).rejects.toThrow(relationshipError);
    expect(versionSelect).toHaveBeenCalledWith("id,storage_bucket,storage_path,source_upload_id,documents!document_versions_document_id_fkey!inner(trip_id)");
  });
});

describe("activity booking linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.cacheParticipantAssignments.mockResolvedValue(undefined);
  });

  it("links the booking and synchronizes its selected travelers with the event", async () => {
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
    const synchronizedBooking = { id: "booking-1", trip_id: "trip-1", participant_scope: "selected" };
    mocks.syncBookingParticipants.mockResolvedValue({ booking: synchronizedBooking, itinerary_items: [linked] });

    await expect(linkBookingToItineraryItem(item, "booking-1", { participantScope: "selected", travelerIds: ["traveler-1"] })).resolves.toEqual(linked);

    expect(mocks.syncBookingParticipants).toHaveBeenCalledWith({ bookingId: "booking-1", participantScope: "selected", travelerIds: ["traveler-1"], itineraryItemId: "activity-1", itineraryVersion: 7 });
    expect(mocks.cacheEntity).toHaveBeenCalledWith("bookings:trip-1", synchronizedBooking);
    expect(mocks.cacheEntity).toHaveBeenCalledWith("itinerary:trip-1", linked);
    expect(mocks.cacheParticipantAssignments).toHaveBeenCalledWith({ tripId: "trip-1", bookingId: "booking-1", itineraryItemIds: ["activity-1"], participantScope: "selected", travelerIds: ["traveler-1"] });
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
    mocks.syncBookingParticipants.mockResolvedValue({ booking: { id: "booking-1", trip_id: "trip-1" }, itinerary_items: [linked] });
    mocks.cacheEntity.mockRejectedValueOnce(cacheError);

    await expect(linkBookingToItineraryItem(item, "booking-1", { participantScope: "everyone", travelerIds: [] })).resolves.toEqual(linked);

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
