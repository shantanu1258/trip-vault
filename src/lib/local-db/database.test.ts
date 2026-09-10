import { describe, expect, it } from "vitest";
import { canOpenLocalDocument, type LocalDocumentRecord } from "./database";

const record: LocalDocumentRecord = {
  profileId: "profile-a",
  documentVersionId: "version-1",
  localPath: "profiles/profile-a/documents/version-1.pdf",
  byteSize: 1200,
  sha256: "demo-checksum",
  verifiedAt: "2026-09-10T00:00:00.000Z"
};

describe("canOpenLocalDocument", () => {
  it("opens a verified local document for the profile that stored it", () => {
    expect(canOpenLocalDocument("profile-a", record)).toBe(true);
  });

  it("does not expose one profile's document to another profile", () => {
    expect(canOpenLocalDocument("profile-b", record)).toBe(false);
  });

  it("requires a current local profile", () => {
    expect(canOpenLocalDocument(null, record)).toBe(false);
  });
});
