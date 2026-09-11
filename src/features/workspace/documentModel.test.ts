import { describe, expect, it } from "vitest";
import { documentAssignmentLabel, documentKind, documentMatchesTraveler, documentPurposeLabel, findDuplicateDocument } from "./documentModel";
import type { VaultDocument } from "./types";

function vaultDocument(overrides: Partial<VaultDocument> = {}): VaultDocument {
  return {
    id: "document-1",
    trip_id: "trip-1",
    booking_id: null,
    flight_leg_id: null,
    traveler_id: null,
    assignment_mode: "shared",
    traveler_ids: [],
    title: "Shared booking",
    category: "hotel",
    purpose: "hotel_confirmation",
    short_label: null,
    visibility: "private",
    current_version_id: "version-1",
    updated_at: "2026-09-11T10:00:00Z",
    current_version: { id: "version-1", storage_path: "test", original_filename: "test.pdf", mime_type: "application/pdf", byte_size: 12, sha256: "a".repeat(64), version_number: 1, created_at: "2026-09-11T10:00:00Z" },
    ...overrides
  };
}

describe("document model", () => {
  it("uses travel-document defaults", () => {
    expect(documentKind("hotel_confirmation")).toMatchObject({ category: "hotel", purpose: "hotel_confirmation", defaultAssignment: "shared" });
    expect(documentKind("boarding_pass").defaultAssignment).toBe("selected");
    expect(documentKind("activity_ticket").defaultAssignment).toBe("unassigned");
    expect(documentPurposeLabel("meal_voucher")).toBe("Meal voucher");
  });

  it("shows shared documents for every traveler but not unassigned tickets", () => {
    expect(documentMatchesTraveler(vaultDocument(), "traveler-1")).toBe(true);
    expect(documentMatchesTraveler(vaultDocument({ assignment_mode: "unassigned" }), "traveler-1")).toBe(false);
    expect(documentMatchesTraveler(vaultDocument({ assignment_mode: "selected", traveler_ids: ["traveler-2"] }), "traveler-1")).toBe(false);
    expect(documentMatchesTraveler(vaultDocument({ assignment_mode: "selected", traveler_ids: ["traveler-1", "traveler-2"] }), "traveler-1")).toBe(true);
  });

  it("labels multi-traveler assignment and detects exact duplicates", () => {
    const document = vaultDocument({ assignment_mode: "selected", traveler_ids: ["traveler-1", "traveler-2"] });
    expect(documentAssignmentLabel(document, new Map([["traveler-1", "Asha"], ["traveler-2", "Ravi"]]))).toBe("Asha, Ravi");
    expect(findDuplicateDocument([document], "A".repeat(64))).toBe(document);
    expect(findDuplicateDocument([document], "b".repeat(64))).toBeUndefined();
  });
});
