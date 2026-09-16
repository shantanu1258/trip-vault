import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cacheEntity: vi.fn(),
  documentEq: vi.fn(),
  documentUpdate: vi.fn(),
  from: vi.fn(),
  localProfileId: vi.fn(),
  travelerDelete: vi.fn(),
  travelerDeleteEq: vi.fn(),
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
  queueUpsert: vi.fn(),
  readEntityById: vi.fn(),
  readEntityList: vi.fn(),
  syncOutbox: vi.fn()
}));

import { updateDocumentDetails } from "./api";
import type { VaultDocument } from "./types";

const document: VaultDocument = {
  id: "document-1",
  trip_id: "trip-1",
  booking_id: "booking-1",
  flight_leg_id: "flight-1",
  traveler_id: "traveler-1",
  assignment_mode: "selected",
  traveler_ids: ["traveler-1"],
  title: "Generated flight ticket title",
  category: "flight",
  purpose: "ticket",
  short_label: null,
  visibility: "trip",
  current_version_id: "version-1",
  updated_at: "2026-09-16T00:00:00.000Z"
};

describe("document detail edits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.localProfileId.mockResolvedValue("user-1");
    mocks.documentEq.mockResolvedValue({ error: null });
    mocks.documentUpdate.mockReturnValue({ eq: mocks.documentEq });
    mocks.travelerDeleteEq.mockResolvedValue({ error: null });
    mocks.travelerDelete.mockReturnValue({ eq: mocks.travelerDeleteEq });
    mocks.travelerInsert.mockResolvedValue({ error: null });
    mocks.cacheEntity.mockResolvedValue(undefined);
    mocks.from.mockImplementation((table: string) =>
      table === "documents"
        ? { update: mocks.documentUpdate }
        : { delete: mocks.travelerDelete, insert: mocks.travelerInsert }
    );
  });

  it("updates the title and replaces the document traveler rows", async () => {
    const updated = await updateDocumentDetails({
      document,
      title: "  Dubai flight tickets  ",
      category: "activity",
      purpose: "activity_ticket",
      assignmentMode: "selected",
      travelerIds: ["traveler-1", "traveler-2", "traveler-2"]
    });

    expect(mocks.documentUpdate).toHaveBeenCalledWith({
      title: "Dubai flight tickets",
      category: "activity",
      purpose: "activity_ticket",
      assignment_mode: "selected",
      traveler_id: null
    });
    expect(mocks.travelerDeleteEq).toHaveBeenCalledWith("document_id", "document-1");
    expect(mocks.travelerInsert).toHaveBeenCalledWith([
      { document_id: "document-1", traveler_id: "traveler-1", assigned_by: "user-1" },
      { document_id: "document-1", traveler_id: "traveler-2", assigned_by: "user-1" }
    ]);
    expect(updated).toMatchObject({
      title: "Dubai flight tickets",
      category: "activity",
      purpose: "activity_ticket",
      assignment_mode: "selected",
      traveler_id: null,
      traveler_ids: ["traveler-1", "traveler-2"]
    });
    expect(mocks.cacheEntity).toHaveBeenCalledWith(
      "documents:trip-1",
      expect.objectContaining({ title: "Dubai flight tickets" })
    );
    expect(mocks.cacheEntity).toHaveBeenCalledWith(
      "documents",
      expect.objectContaining({ title: "Dubai flight tickets" })
    );
  });

  it("requires a traveler when Selected travelers is chosen", async () => {
    await expect(
      updateDocumentDetails({
        document,
        title: "Ticket",
        category: "flight",
        purpose: "ticket",
        assignmentMode: "selected",
        travelerIds: []
      })
    ).rejects.toThrow("Choose at least one traveler");
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
  });
});
