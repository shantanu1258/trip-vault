import { describe, expect, it } from "vitest";
import { ensureBlobMimeType } from "./offlineFiles";

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
});
