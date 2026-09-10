import { describe, expect, it } from "vitest";
import { reorderIds, validateEventDocumentSelection } from "./eventDocumentRules";
import type { EventDocumentLink, VaultDocument } from "./types";

const document = (id: string, tripId: string): VaultDocument => ({ id, trip_id: tripId, booking_id: null, flight_leg_id: null, traveler_id: null, title: id, category: "other", purpose: "other", short_label: null, visibility: "trip", current_version_id: null, updated_at: "" });
describe("event documents", () => {
  it("rejects cross-trip and duplicate links independently", () => { const existing = [{ document_id: "same" }] as EventDocumentLink[]; const result = validateEventDocumentSelection("trip-a", [document("ok", "trip-a"), document("same", "trip-a"), document("foreign", "trip-b")], existing); expect(result.valid.map((item) => item.id)).toEqual(["ok"]); expect(result.rejected.map((item) => item.reason)).toEqual(["duplicate", "different_trip"]); });
  it("reorders stable IDs without dropping any link", () => expect(reorderIds(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]));
});
