import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bookingInsert: vi.fn(),
  bookingSelect: vi.fn(),
  bookingSingle: vi.fn(),
  bookingUpdate: vi.fn(),
  cacheEntity: vi.fn(),
  cleanupEq: vi.fn(),
  from: vi.fn(),
  localProfileId: vi.fn(),
  travelerInsert: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("../sync/localSync", () => ({
  cacheEntity: mocks.cacheEntity,
  cacheEntityList: vi.fn(),
  discardDocumentUploadOperations: vi.fn(),
  localProfileId: mocks.localProfileId,
  networkWithCache: vi.fn(),
  queueAccountDocumentUpload: vi.fn(),
  queueCreate: vi.fn(),
  queueDelete: vi.fn(),
  queueDocumentAssociation: vi.fn(),
  queueDocumentUpload: vi.fn(),
  queueUpdate: vi.fn(),
  readEntityById: vi.fn(),
  readEntityList: vi.fn(),
  syncOutbox: vi.fn()
}));

import { addBooking, bookingInputForTimelineEvent } from "./api";

describe("timeline event booking timing", () => {
  it("removes a flexible relative event's synthetic anchor time from booking metadata", () => {
    const bookingInput = bookingInputForTimelineEvent({
      tripId: "trip-1",
      type: "activity",
      eventType: "activity",
      title: "Museum visit",
      startsAt: "2026-09-28T09:30:00.000Z",
      endsAt: "2026-09-28T11:00:00.000Z",
      timezone: "Asia/Kolkata",
      timingMode: "relative",
      anchorItineraryItemId: "anchor-1",
      relativePosition: "after",
      hasExplicitStartTime: false,
      durationMinutes: 90
    });

    expect(bookingInput).not.toHaveProperty("startsAt");
    expect(bookingInput).not.toHaveProperty("endsAt");
    expect(bookingInput).not.toHaveProperty("timezone");
  });

  it("keeps exact hotel timing even when the explicit flag is absent", () => {
    const bookingInput = bookingInputForTimelineEvent({
      tripId: "trip-1",
      type: "hotel",
      eventType: "hotel_check_in",
      title: "Marina hotel",
      startsAt: "2026-09-28T09:30:00.000Z",
      endsAt: "2026-09-29T05:30:00.000Z",
      timezone: "Asia/Kolkata"
    });

    expect(bookingInput).toEqual(expect.objectContaining({
      startsAt: "2026-09-28T09:30:00.000Z",
      endsAt: "2026-09-29T05:30:00.000Z",
      timezone: "Asia/Kolkata"
    }));
  });
});

describe("booking creation compensation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.localProfileId.mockResolvedValue("user-1");
    mocks.bookingSelect.mockReturnValue({ single: mocks.bookingSingle });
    mocks.bookingInsert.mockReturnValue({ select: mocks.bookingSelect });
    mocks.bookingUpdate.mockReturnValue({ eq: mocks.cleanupEq });
    mocks.bookingSingle.mockImplementation(async () => ({
      data: {
        ...mocks.bookingInsert.mock.calls[0][0],
        created_at: "2026-09-13T12:00:00.000Z",
        updated_at: "2026-09-13T12:00:00.000Z"
      },
      error: null
    }));
    mocks.cleanupEq.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => table === "bookings"
      ? { insert: mocks.bookingInsert, update: mocks.bookingUpdate }
      : { insert: mocks.travelerInsert });
  });

  it("archives the unfinished booking when participant insertion fails", async () => {
    const participantError = { code: "42501", message: "booking traveler policy rejected the row" };
    mocks.travelerInsert.mockResolvedValue({ error: participantError });

    await expect(addBooking({
      tripId: "trip-1",
      type: "activity",
      title: "Museum visit",
      startsAt: "2026-09-28T04:00:00.000Z",
      timezone: "Asia/Dubai",
      travelerIds: ["traveler-1"]
    })).rejects.toEqual(participantError);

    const createdId = mocks.bookingInsert.mock.calls[0][0].id;
    expect(mocks.bookingUpdate).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    expect(mocks.cleanupEq).toHaveBeenCalledWith("id", createdId);
    expect(mocks.cacheEntity).not.toHaveBeenCalled();
  });

  it("reports the unfinished booking id if participant rollback also fails", async () => {
    mocks.travelerInsert.mockResolvedValue({ error: { code: "42501", message: "participants failed" } });
    mocks.cleanupEq.mockResolvedValue({ error: { code: "42501", message: "cleanup failed" } });

    let caught: unknown;
    try {
      await addBooking({ tripId: "trip-1", type: "activity", title: "Museum visit", travelerIds: ["traveler-1"] });
    } catch (error) {
      caught = error;
    }
    const createdId = mocks.bookingInsert.mock.calls[0][0].id;
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(`Booking ID: ${createdId}`);
    expect(mocks.cacheEntity).not.toHaveBeenCalled();
  });
});
