import { describe, expect, it } from "vitest";
import { ensureBlobMimeType, outboxOperationNeedsOfflineFile } from "./offlineFiles";

describe("offline document blobs", () => {
  it("restores the declared PDF type after extensionless device storage", async () => {
    const stored = new Blob(["pdf-bytes"]);
    const restored = ensureBlobMimeType(stored, "application/pdf");
    expect(restored.type).toBe("application/pdf");
    expect(restored.size).toBe(stored.size);
  });

  it("keeps an already-correct image blob unchanged", () => {
    const image = new Blob(["image"], { type: "image/png" });
    expect(ensureBlobMimeType(image, "image/png")).toBe(image);
  });

  it("protects both trip and account inbox bytes while their upload is queued", () => {
    expect(
      outboxOperationNeedsOfflineFile(
        {
          operation: "upload_document",
          entityId: "document-1",
          payload: { version: { id: "version-1" } }
        },
        "version-1"
      )
    ).toBe(true);
    expect(
      outboxOperationNeedsOfflineFile(
        {
          operation: "upload_account_document",
          entityId: "upload-1",
          payload: { upload: { id: "upload-1" } }
        },
        "upload-1"
      )
    ).toBe(true);
    expect(
      outboxOperationNeedsOfflineFile(
        {
          operation: "associate_account_document",
          entityId: "document-1",
          payload: { uploadId: "upload-1" }
        },
        "upload-1"
      )
    ).toBe(false);
  });
});
