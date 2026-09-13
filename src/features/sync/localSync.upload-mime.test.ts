import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OutboxOperation } from "../../lib/local-db/database";

const mocks = vi.hoisted(() => {
  const toArray = vi.fn();
  const equals = vi.fn(() => ({ toArray }));
  const where = vi.fn(() => ({ equals }));
  const deleteOperation = vi.fn().mockResolvedValue(undefined);
  const updateOperation = vi.fn().mockResolvedValue(undefined);
  const getEntity = vi.fn().mockResolvedValue(null);
  const putEntity = vi.fn().mockResolvedValue(undefined);
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ upsert, update }));
  const upload = vi.fn().mockResolvedValue({ error: null });
  const storageFrom = vi.fn(() => ({ upload }));
  const rpc = vi.fn();
  const readOfflineFile = vi.fn(async (_profileId: string, _versionId: string, expectedMimeType?: string) => new Blob(["bytes"], { type: expectedMimeType }));

  return {
    database: {
      outbox: { where, bulkGet: vi.fn().mockResolvedValue([]), delete: deleteOperation, update: updateOperation },
      entities: { get: getEntity, put: putEntity }
    },
    deleteOperation,
    from,
    readOfflineFile,
    rpc,
    storageFrom,
    toArray,
    upload
  };
});

vi.mock("../../lib/local-db/database", () => ({ database: mocks.database }));
vi.mock("../../lib/storage/offlineFiles", () => ({ readOfflineFile: mocks.readOfflineFile }));
vi.mock("../../lib/auth/deviceSession", () => ({ resolveDeviceProfileId: vi.fn().mockResolvedValue("profile-1") }));
vi.mock("../../lib/supabase/client", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, storage: { from: mocks.storageFrom } }
}));

import { syncOutbox } from "./localSync";

function operation(operation: OutboxOperation["operation"], payload: Record<string, unknown>): OutboxOperation {
  return {
    operationId: `${operation}-1`,
    profileId: "profile-1",
    entityType: operation === "upload_account_document" ? "account-document-uploads" : "documents",
    entityId: "entity-1",
    operation,
    payload,
    dependsOn: [],
    attemptCount: 0,
    createdAt: "2026-09-13T00:00:00.000Z"
  };
}

describe("offline upload MIME restoration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true);
    mocks.readOfflineFile.mockImplementation(async (_profileId: string, _versionId: string, expectedMimeType?: string) => new Blob(["bytes"], { type: expectedMimeType }));
    mocks.upload.mockResolvedValue({ error: null });
  });

  it("restores the private-inbox MIME before Supabase wraps the Blob in multipart form data", async () => {
    const upload = { id: "upload-1", mime_type: "application/pdf" };
    mocks.toArray.mockResolvedValue([operation("upload_account_document", { upload, storagePath: "profile-1/upload-1/ticket.pdf" })]);
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "Document file is not stored yet" } })
      .mockResolvedValueOnce({ data: "2026-09-13T01:00:00.000Z", error: null });

    await expect(syncOutbox()).resolves.toEqual({ synced: 1, failed: 0 });

    expect(mocks.readOfflineFile).toHaveBeenCalledWith("profile-1", "upload-1", "application/pdf");
    const uploadedBlob = mocks.upload.mock.calls[0]?.[1] as Blob;
    expect(uploadedBlob.type).toBe("application/pdf");
  });

  it("restores the MIME for queued trip-document versions too", async () => {
    const document = { id: "document-1" };
    const version = { id: "version-1", mime_type: "image/png" };
    mocks.toArray.mockResolvedValue([operation("upload_document", { document, version, storagePath: "trips/trip-1/document-1/image.png" })]);

    await expect(syncOutbox()).resolves.toEqual({ synced: 1, failed: 0 });

    expect(mocks.readOfflineFile).toHaveBeenCalledWith("profile-1", "version-1", "image/png");
    const uploadedBlob = mocks.upload.mock.calls[0]?.[1] as Blob;
    expect(uploadedBlob.type).toBe("image/png");
  });
});
