import { describe, expect, it, vi } from "vitest";
import type { OutboxOperation } from "../../lib/local-db/database";
import { associatedAccountDocumentUpload, classifySyncError, ensureAccountDocumentStored, isDuplicateKeyError, isDuplicateStorageObjectError, orderOutbox } from "./localSync";

const operation = (id: string, dependsOn: string[] = [], createdAt = id): OutboxOperation => ({ operationId: id, profileId: "p", entityType: "test", entityId: id, operation: "create", payload: {}, dependsOn, attemptCount: 0, createdAt });
describe("foreground synchronization", () => {
  it("places dependencies before dependent file links", () => expect(orderOutbox([operation("link", ["document"]), operation("document")]).map((item) => item.operationId)).toEqual(["document", "link"]));
  it("orders unrelated operations by creation time", () => expect(orderOutbox([operation("later", [], "2"), operation("earlier", [], "1")]).map((item) => item.operationId)).toEqual(["earlier", "later"]));
  it("keeps cyclic operations available for diagnosis", () => expect(orderOutbox([operation("a", ["b"]), operation("b", ["a"])]).map((item) => item.operationId)).toEqual(["a", "b"]));
  it("classifies conflicts, quota, authentication, permissions, schema drift, retryable failures, and generic failures", () => { expect(classifySyncError(new Error("version_conflict"))).toBe("conflict"); expect(classifySyncError(new Error("Not enough space"))).toBe("quota"); expect(classifySyncError(new Error("session expired"))).toBe("authentication"); expect(classifySyncError(new Error("row level security policy"))).toBe("permission"); expect(classifySyncError({ code: "42501", message: "new row violates row-level security policy" })).toBe("permission"); expect(classifySyncError({ statusCode: 403, message: "Web DLP Policy blocked this upload" })).toBe("permission"); expect(classifySyncError({ code: "42703", message: "column assignment_mode does not exist" })).toBe("schema"); expect(classifySyncError(new Error("network timeout"))).toBe("retryable"); expect(classifySyncError(new Error("bad value"))).toBe("failed"); });
  it("retries partially-created document uploads without treating RLS failures as duplicates", () => {
    expect(isDuplicateKeyError({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(true);
    expect(isDuplicateKeyError({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
  });
  it("only ignores an actual duplicate Storage object response", () => {
    expect(isDuplicateStorageObjectError({ statusCode: "409", message: "The resource already exists" })).toBe(true);
    expect(isDuplicateStorageObjectError({ error: "Duplicate", message: "Duplicate" })).toBe(true);
    expect(isDuplicateStorageObjectError({ statusCode: "404", message: "The object does not exist" })).toBe(false);
    expect(isDuplicateStorageObjectError({ statusCode: "403", message: "Upload forbidden" })).toBe(false);
  });
  it("recovers a lost finalization response without uploading the same bytes again", async () => {
    const finalize = vi.fn().mockResolvedValue({ data: "2026-09-13T12:00:00.000Z", error: null });
    const upload = vi.fn();

    await expect(ensureAccountDocumentStored({ finalize, upload })).resolves.toBe("2026-09-13T12:00:00.000Z");
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });
  it("uploads only after finalization explicitly reports that the object is missing", async () => {
    const finalize = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { message: "Document file is not stored yet" } })
      .mockResolvedValueOnce({ data: "2026-09-13T12:01:00.000Z", error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });

    await expect(ensureAccountDocumentStored({ finalize, upload })).resolves.toBe("2026-09-13T12:01:00.000Z");
    expect(finalize).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it("marks a background-associated upload so the local inbox cannot resurrect it", () => {
    expect(associatedAccountDocumentUpload({ id: "upload-1", associated_document_id: null, sync_state: "queued", association_pending: true, can_retry: true }, "document-1", "2026-09-13T12:02:00.000Z")).toEqual({
      id: "upload-1",
      associated_document_id: "document-1",
      updated_at: "2026-09-13T12:02:00.000Z",
      sync_state: "synced",
      association_pending: false,
      sync_error: undefined,
      can_retry: false
    });
  });
});
