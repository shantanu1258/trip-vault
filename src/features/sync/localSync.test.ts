import { describe, expect, it, vi } from "vitest";
import type { OutboxOperation } from "../../lib/local-db/database";
import { associatedAccountDocumentUpload, classifySyncError, ensureAccountDocumentStored, isDuplicateKeyError, isDuplicateStorageObjectError, isParticipantScopeMismatchError, orderOutbox, upgradeLegacyOutboxOperations } from "./localSync";

const operation = (id: string, dependsOn: string[] = [], createdAt = id): OutboxOperation => ({ operationId: id, profileId: "p", entityType: "test", entityId: id, operation: "create", payload: {}, dependsOn, attemptCount: 0, createdAt });
describe("foreground synchronization", () => {
  it("places dependencies before dependent file links", () => expect(orderOutbox([operation("link", ["document"]), operation("document")]).map((item) => item.operationId)).toEqual(["document", "link"]));
  it("orders unrelated operations by creation time", () => expect(orderOutbox([operation("later", [], "2"), operation("earlier", [], "1")]).map((item) => item.operationId)).toEqual(["earlier", "later"]));
  it("keeps cyclic operations available for diagnosis", () => expect(orderOutbox([operation("a", ["b"]), operation("b", ["a"])]).map((item) => item.operationId)).toEqual(["a", "b"]));
  it("upgrades legacy journey details before the stricter shape constraint", () => {
    const train = { ...operation("train"), entityType: "journey-legs:trip", payload: { table: "journey_legs", row: { id: "train", mode: "train" } } };
    const cab = { ...operation("cab"), entityType: "journey-legs:trip", payload: { table: "journey_legs", row: { id: "cab", mode: "cab", details: {} } } };

    const result = upgradeLegacyOutboxOperations([train, cab]);

    expect((result.operations[0].payload as { row: { details: unknown } }).row.details).toEqual({ kind: "train" });
    expect((result.operations[1].payload as { row: { details: unknown } }).row.details).toEqual({ kind: "cab", ride_type: "local" });
    expect(result.updatedOperationIds).toEqual(["train", "cab"]);
  });
  it("makes a legacy booking with traveler rows explicitly Selected and orders its children after it", () => {
    const booking = { ...operation("booking"), entityType: "bookings:trip", entityId: "booking-1", payload: { table: "bookings", row: { id: "booking-1", type: "bus" } } };
    const traveler = { ...operation("traveler"), entityType: "booking-travelers:booking-1", payload: { table: "booking_travelers", row: { booking_id: "booking-1", traveler_id: "traveler-1" } } };

    const result = upgradeLegacyOutboxOperations([traveler, booking]);
    const savedBooking = result.operations.find((item) => item.operationId === "booking")!;
    const savedTraveler = result.operations.find((item) => item.operationId === "traveler")!;

    expect((savedBooking.payload as { row: { participant_scope: string } }).row.participant_scope).toBe("selected");
    expect(savedTraveler.dependsOn).toContain("booking");
    expect(result.removedOperationIds).toEqual([]);
  });
  it("canonicalizes a legacy booking without traveler rows to Everyone", () => {
    const booking = { ...operation("booking"), entityType: "bookings:trip", entityId: "booking-1", payload: { table: "bookings", row: { id: "booking-1", type: "hotel" } } };
    const result = upgradeLegacyOutboxOperations([booking]);
    expect((result.operations[0].payload as { row: { participant_scope: string } }).row.participant_scope).toBe("everyone");
  });
  it("removes contradictory traveler inserts for an explicitly Everyone booking but retains cleanup deletes", () => {
    const booking = { ...operation("booking"), entityType: "bookings:trip", entityId: "booking-1", payload: { table: "bookings", row: { id: "booking-1", participant_scope: "everyone" } } };
    const addition = { ...operation("add"), payload: { table: "booking_travelers", row: { booking_id: "booking-1", traveler_id: "traveler-1" } } };
    const deletion = { ...operation("delete"), operation: "delete" as const, payload: { table: "booking_travelers", match: { booking_id: "booking-1", traveler_id: "traveler-2" }, hard: true } };

    const result = upgradeLegacyOutboxOperations([booking, addition, deletion]);

    expect(result.operations.map((item) => item.operationId)).toEqual(["booking", "delete"]);
    expect(result.removedOperationIds).toEqual(["add"]);
  });
  it("marks an orphaned legacy traveler row for a guarded server-scope repair", () => {
    const traveler = { ...operation("traveler"), payload: { table: "booking_travelers", row: { booking_id: "booking-1", traveler_id: "traveler-1" } } };
    const result = upgradeLegacyOutboxOperations([traveler]);
    expect(result.operations[0].payload).toMatchObject({ legacyParticipantScopeRepair: true });
    expect(isParticipantScopeMismatchError({ message: "Booking traveler rows require Selected scope" })).toBe(true);
    expect(isParticipantScopeMismatchError({ message: "Assigned traveler must belong to the same trip" })).toBe(false);
  });
  it("orders per-leg allocations after the matching Selected booking traveler row", () => {
    const booking = { ...operation("booking"), entityId: "booking-1", payload: { table: "bookings", row: { id: "booking-1", participant_scope: "selected" } } };
    const bookingTraveler = { ...operation("booking-traveler", ["booking"]), payload: { table: "booking_travelers", row: { booking_id: "booking-1", traveler_id: "traveler-1" } } };
    const leg = { ...operation("leg", ["booking"]), entityId: "leg-1", payload: { table: "journey_legs", row: { id: "leg-1", booking_id: "booking-1", mode: "bus", details: { kind: "bus" } } } };
    const allocation = { ...operation("allocation", ["leg"]), payload: { table: "journey_leg_travelers", row: { journey_leg_id: "leg-1", traveler_id: "traveler-1" } } };

    const result = upgradeLegacyOutboxOperations([allocation, leg, bookingTraveler, booking]);
    const savedAllocation = result.operations.find((item) => item.operationId === "allocation")!;

    expect(savedAllocation.dependsOn).toEqual(["leg", "booking-traveler"]);
    expect(orderOutbox(result.operations).map((item) => item.operationId).indexOf("booking-traveler"))
      .toBeLessThan(orderOutbox(result.operations).map((item) => item.operationId).indexOf("allocation"));
  });
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
