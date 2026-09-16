import { describe, expect, it } from "vitest";
import {
  googleMapsDirectionsUrl,
  googleMapsSearchUrl,
  isMissingAccountDocumentObject,
  journeyTimelineFields,
  mergeAccountDocumentUploads,
  mergeCloudAndPendingDocuments,
  normalizeJoinCode,
  normalizeJourneyLegDetails,
  sanitizeFilename,
  validateDocumentFile
} from "./api";
import type { AccountDocumentUpload, VaultDocument } from "./types";

function document(id: string, title: string, updatedAt: string, withFile = true): VaultDocument {
  return {
    id,
    trip_id: "trip-1",
    booking_id: null,
    flight_leg_id: null,
    traveler_id: null,
    title,
    category: "other",
    purpose: "other",
    short_label: null,
    visibility: "trip",
    current_version_id: withFile ? `${id}-version` : null,
    current_version: withFile
      ? {
          id: `${id}-version`,
          storage_path: id,
          original_filename: `${id}.pdf`,
          mime_type: "application/pdf",
          byte_size: 10,
          sha256: "abc",
          version_number: 1,
          created_at: updatedAt
        }
      : null,
    updated_at: updatedAt
  };
}

describe("workspace boundaries", () => {
  it("normalizes displayed join-code separators", () =>
    expect(normalizeJoinCode(" abcd-efgh/jkmn.pqrs ")).toBe("ABCDEFGHJKMNPQRS"));
  it("prefers coordinates and encodes Google Maps URLs without a key", () => {
    expect(googleMapsSearchUrl({ address: "ignored", latitude: 12.3, longitude: 45.6 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=12.3%2C45.6"
    );
    expect(googleMapsDirectionsUrl("Via Roma 1, Rome")).toContain("Via%20Roma%201%2C%20Rome");
  });
  it("sanitizes provider filenames without traversal-like prefixes or losing the extension", () =>
    expect(sanitizeFilename("../Sam's Boarding Pass (final).pdf")).toBe(
      "Sam-s-Boarding-Pass-final.pdf"
    ));
  it("accepts 4,999,999 bytes and rejects exactly 5,000,000", () => {
    expect(() =>
      validateDocumentFile(
        new File([new Uint8Array(4_999_999)], "ok.pdf", { type: "application/pdf" })
      )
    ).not.toThrow();
    expect(() =>
      validateDocumentFile(
        new File([new Uint8Array(5_000_000)], "too-large.pdf", { type: "application/pdf" })
      )
    ).toThrow(/smaller than 5 MB/i);
  });
  it("rejects executable content regardless of its filename", () =>
    expect(() =>
      validateDocumentFile(new File(["x"], "ticket.pdf", { type: "text/html" }))
    ).toThrow(/PDF, JPEG, PNG, or WebP/i));
  it("keeps a locally saved document visible while its cloud upload is pending", () => {
    const local = document("local", "Boarding pass", "2026-09-11T10:00:00Z");
    const result = mergeCloudAndPendingDocuments([], [local], [local.id]);
    expect(result).toEqual([{ ...local, sync_state: "queued" }]);
  });
  it("prefers the complete local copy over a partial cloud row during a resumable upload", () => {
    const local = document("retry", "Local ticket", "2026-09-11T10:00:00Z");
    const partialCloud = document("retry", "Cloud row", "2026-09-11T09:00:00Z", false);
    expect(mergeCloudAndPendingDocuments([partialCloud], [local], [local.id])[0]).toMatchObject({
      title: "Local ticket",
      current_version_id: "retry-version",
      sync_state: "queued"
    });
  });
  it("keeps an unfinished account upload in the private inbox until association succeeds", () => {
    const upload: AccountDocumentUpload = {
      id: "upload-1",
      owner_id: "account-1",
      storage_path: "account-1/upload-1/ticket.pdf",
      original_filename: "ticket.pdf",
      mime_type: "application/pdf",
      byte_size: 42,
      sha256: "a".repeat(64),
      associated_document_id: null,
      stored_at: null,
      created_at: "2026-09-13T10:00:00Z",
      updated_at: "2026-09-13T10:00:00Z"
    };
    expect(mergeAccountDocumentUploads([], [upload], [upload.id])).toEqual([
      { ...upload, sync_state: "queued" }
    ]);
    expect(
      mergeAccountDocumentUploads(
        [{ ...upload, associated_document_id: "document-1" }],
        [upload],
        [upload.id]
      )
    ).toEqual([]);
  });
  it("does not report a cloud metadata row as stored until the server verified its object", () => {
    const upload: AccountDocumentUpload = {
      id: "upload-2",
      owner_id: "account-1",
      storage_path: "account-1/upload-2/ticket.pdf",
      original_filename: "ticket.pdf",
      mime_type: "application/pdf",
      byte_size: 42,
      sha256: "b".repeat(64),
      associated_document_id: null,
      stored_at: null,
      created_at: "2026-09-13T11:00:00Z",
      updated_at: "2026-09-13T11:00:00Z"
    };
    expect(mergeAccountDocumentUploads([upload], [], [])[0]).toMatchObject({
      stored_at: null,
      sync_state: "queued"
    });
    expect(
      mergeAccountDocumentUploads([{ ...upload, stored_at: "2026-09-13T11:01:00Z" }], [], [])[0]
    ).toMatchObject({ sync_state: "synced" });
  });
  it("distinguishes a server-confirmed missing object from unrelated verification failures", () => {
    expect(isMissingAccountDocumentObject({ message: "Document file is not stored yet" })).toBe(
      true
    );
    expect(isMissingAccountDocumentObject({ message: "Failed to fetch" })).toBe(false);
    expect(isMissingAccountDocumentObject(new Error("network timeout"))).toBe(false);
  });
  it("defaults compatible journey details and rejects details from another mode", () => {
    expect(normalizeJourneyLegDetails("bus")).toEqual({ kind: "bus" });
    expect(normalizeJourneyLegDetails("cab")).toEqual({ kind: "cab", ride_type: "local" });
    expect(() => normalizeJourneyLegDetails("train", { kind: "bus" })).toThrow(/cannot be used/);
  });
  it("validates mode-specific journey details before they enter the offline queue", () => {
    expect(
      normalizeJourneyLegDetails("ferry", {
        kind: "ferry",
        seating: "assigned",
        vehicle: { length_cm: 420 }
      })
    ).toMatchObject({ seating: "assigned" });
    expect(() =>
      normalizeJourneyLegDetails("ferry", { kind: "ferry", seating: "reserved" } as never)
    ).toThrow(/ticket details/i);
    expect(() =>
      normalizeJourneyLegDetails("cab", {
        kind: "cab",
        ride_type: "airport_transfer",
        luggage_count: -1
      })
    ).toThrow(/ticket details/i);
    expect(() =>
      normalizeJourneyLegDetails("bus", { kind: "bus", airline: "not applicable" } as never)
    ).toThrow(/ticket details/i);
  });
  it("uses a cab's relative timeline semantics instead of flattening it to the journey departure", () => {
    expect(
      journeyTimelineFields(
        {
          startsAt: "2026-09-28T09:30:00.000Z",
          timezone: "Asia/Kolkata",
          timingMode: "relative",
          anchorItineraryItemId: "checkout-1",
          relativePosition: "after",
          hasExplicitStartTime: false,
          durationMinutes: 30
        },
        {
          startsAt: "2026-09-28T10:00:00.000Z",
          timezone: "Asia/Kolkata"
        }
      )
    ).toMatchObject({
      timingMode: "relative",
      anchorItineraryItemId: "checkout-1",
      relativePosition: "after",
      hasExplicitStartTime: false,
      durationMinutes: 30
    });
  });
});
