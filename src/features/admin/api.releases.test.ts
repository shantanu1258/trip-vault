import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), range: vi.fn() }));
vi.mock("../../lib/supabase/client", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));
import { discardConfigDraft, getReleaseSnapshot } from "./api";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockResolvedValue({ error: null });
  mocks.range.mockResolvedValue({ data: [], error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      range: (start: number, end: number) => mocks.range(table, start, end)
    };
    return query;
  });
});

it("discards only through the protected RPC and explains a missing server upgrade", async () => {
  await discardConfigDraft("draft-id");
  expect(mocks.rpc).toHaveBeenCalledWith("discard_config_draft", {
    requested_release_id: "draft-id"
  });
  expect(mocks.from).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ error: { code: "PGRST202" } });
  await expect(discardConfigDraft("draft-id")).rejects.toThrow("202609220004_admin_release_management.sql");
});

it("paginates raw snapshots without silently replacing missing palettes or merging built-ins", async () => {
  mocks.range.mockImplementation(async (table, start) => ({
    error: null,
    data:
      table === "airline_catalog_entries"
        ? start === 0
          ? Array.from({ length: 500 }, (_, i) => ({ stable_key: `air-${i}` }))
          : [{ stable_key: "last" }]
        : []
  }));
  const result = await getReleaseSnapshot("draft-id");
  expect(result.Airlines).toHaveLength(501);
  expect(result.Appearance).toEqual([]);
  expect(result.Airports).toEqual([]);
  expect(mocks.range).toHaveBeenCalledWith("airline_catalog_entries", 500, 999);
});

it("fails the comparison when any section cannot be read", async () => {
  const error = new Error("Unavailable");
  mocks.range.mockResolvedValue({ data: null, error });
  await expect(getReleaseSnapshot("draft-id")).rejects.toBe(error);
});
