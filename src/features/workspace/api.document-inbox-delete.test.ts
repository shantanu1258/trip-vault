import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountDocumentUpload } from "./types";

const mocks = vi.hoisted(() => ({
  discardDocumentUploadOperations: vi.fn(),
  entityDelete: vi.fn(),
  localProfileId: vi.fn(),
  outboxRows: [] as Array<Record<string, unknown>>,
  removeOfflineFile: vi.fn()
}));

vi.mock("../../lib/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("../../lib/storage/offlineFiles", () => ({
  ensureBlobMimeType: vi.fn(),
  removeOfflineFile: mocks.removeOfflineFile,
  storeOfflineFile: vi.fn()
}));
vi.mock("../../lib/local-db/database", () => {
  const collection = {
    equals: vi.fn(),
    filter: vi.fn()
  };
  collection.equals.mockReturnValue(collection);
  collection.filter.mockImplementation((predicate: (row: Record<string, unknown>) => boolean) => ({
    toArray: async () => mocks.outboxRows.filter(predicate)
  }));
  return {
    database: {
      outbox: { where: vi.fn(() => collection) },
      entities: { delete: mocks.entityDelete }
    }
  };
});
vi.mock("../sync/localSync", () => ({
  cacheEntity: vi.fn(),
  cacheEntityList: vi.fn(),
  discardDocumentUploadOperations: mocks.discardDocumentUploadOperations,
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
vi.mock("../trips/api", () => ({ addItineraryItem: vi.fn(), addTripCost: vi.fn() }));
vi.mock("../metadata/publishedConfig", () => ({ listAvailableAirlines: vi.fn() }));

import { deleteAccountDocumentUpload } from "./api";

function upload(overrides: Partial<AccountDocumentUpload> = {}): AccountDocumentUpload {
  return {
    id: "upload-1",
    owner_id: "user-1",
    storage_path: "user-1/upload-1/ticket.pdf",
    original_filename: "ticket.pdf",
    mime_type: "application/pdf",
    byte_size: 42,
    sha256: "a".repeat(64),
    associated_document_id: null,
    stored_at: null,
    created_at: "2026-09-13T10:00:00.000Z",
    updated_at: "2026-09-13T10:00:00.000Z",
    sync_state: "queued",
    ...overrides
  };
}

describe("offline Document Inbox deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.outboxRows.splice(0);
    mocks.localProfileId.mockResolvedValue("user-1");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
  });

  it("keeps a cloud-synced upload local while offline even if a stale upload operation exists", async () => {
    const synced = upload({ stored_at: "2026-09-13T10:01:00.000Z", sync_state: "synced" });
    mocks.outboxRows.push({ operation: "upload_account_document", entityId: synced.id, attemptCount: 0, payload: { uploadId: synced.id } });

    await expect(deleteAccountDocumentUpload(synced)).rejects.toThrow(/Reconnect to delete this Document Inbox file/);
    expect(mocks.discardDocumentUploadOperations).not.toHaveBeenCalled();
    expect(mocks.removeOfflineFile).not.toHaveBeenCalled();
    expect(mocks.entityDelete).not.toHaveBeenCalled();
  });

  it("also blocks an offline delete when no pending first-upload operation proves the file is local-only", async () => {
    await expect(deleteAccountDocumentUpload(upload())).rejects.toThrow(/cloud-backed file would reappear/i);
    expect(mocks.entityDelete).not.toHaveBeenCalled();
  });

  it("blocks a previously attempted upload because a partial cloud row may already exist", async () => {
    const failed = upload();
    mocks.outboxRows.push({ operation: "upload_account_document", entityId: failed.id, attemptCount: 1, lastErrorCode: "network", payload: { uploadId: failed.id } });

    await expect(deleteAccountDocumentUpload(failed)).rejects.toThrow(/cloud-backed file would reappear/i);
    expect(mocks.discardDocumentUploadOperations).not.toHaveBeenCalled();
    expect(mocks.entityDelete).not.toHaveBeenCalled();
  });

  it("discards a never-synced upload and its pending operation while offline", async () => {
    const pending = upload();
    mocks.outboxRows.push({ operation: "upload_account_document", entityId: pending.id, attemptCount: 0, payload: { uploadId: pending.id } });

    await expect(deleteAccountDocumentUpload(pending)).resolves.toBeUndefined();
    expect(mocks.discardDocumentUploadOperations).toHaveBeenCalledWith(pending.id, undefined);
    expect(mocks.removeOfflineFile).toHaveBeenCalledWith("user-1", pending.id);
    expect(mocks.entityDelete).toHaveBeenCalledWith(["user-1", "account-document-uploads", pending.id]);
  });
});
