import { describe, expect, it } from "vitest";
import type { OutboxOperation } from "../../lib/local-db/database";
import { classifySyncError, isDuplicateKeyError, orderOutbox } from "./localSync";

const operation = (id: string, dependsOn: string[] = [], createdAt = id): OutboxOperation => ({ operationId: id, profileId: "p", entityType: "test", entityId: id, operation: "create", payload: {}, dependsOn, attemptCount: 0, createdAt });
describe("foreground synchronization", () => {
  it("places dependencies before dependent file links", () => expect(orderOutbox([operation("link", ["document"]), operation("document")]).map((item) => item.operationId)).toEqual(["document", "link"]));
  it("orders unrelated operations by creation time", () => expect(orderOutbox([operation("later", [], "2"), operation("earlier", [], "1")]).map((item) => item.operationId)).toEqual(["earlier", "later"]));
  it("keeps cyclic operations available for diagnosis", () => expect(orderOutbox([operation("a", ["b"]), operation("b", ["a"])]).map((item) => item.operationId)).toEqual(["a", "b"]));
  it("classifies conflicts, quota, authentication, permissions, schema drift, retryable failures, and generic failures", () => { expect(classifySyncError(new Error("version_conflict"))).toBe("conflict"); expect(classifySyncError(new Error("Not enough space"))).toBe("quota"); expect(classifySyncError(new Error("session expired"))).toBe("authentication"); expect(classifySyncError(new Error("row level security policy"))).toBe("permission"); expect(classifySyncError({ code: "42501", message: "new row violates row-level security policy" })).toBe("permission"); expect(classifySyncError({ code: "42703", message: "column assignment_mode does not exist" })).toBe("schema"); expect(classifySyncError(new Error("network timeout"))).toBe("retryable"); expect(classifySyncError(new Error("bad value"))).toBe("failed"); });
  it("retries partially-created document uploads without treating RLS failures as duplicates", () => {
    expect(isDuplicateKeyError({ code: "23505", message: "duplicate key value violates unique constraint" })).toBe(true);
    expect(isDuplicateKeyError({ code: "42501", message: "new row violates row-level security policy" })).toBe(false);
  });
});
