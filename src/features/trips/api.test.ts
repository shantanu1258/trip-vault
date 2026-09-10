import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheEntity: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  localProfileId: vi.fn()
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

import { createTrip } from "./api";

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
