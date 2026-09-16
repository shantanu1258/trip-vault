import { describe, expect, it } from "vitest";
import { normalizeParticipantSelection } from "./participantScope";

describe("normalizeParticipantSelection", () => {
  it("stores Everyone explicitly with no traveler IDs", () => {
    expect(normalizeParticipantSelection("everyone", [])).toEqual({
      participantScope: "everyone",
      travelerIds: []
    });
  });

  it("deduplicates an explicit Selected list", () => {
    expect(normalizeParticipantSelection("selected", ["a", "a", "b"])).toEqual({
      participantScope: "selected",
      travelerIds: ["a", "b"]
    });
  });

  it("rejects contradictory or empty explicit selections", () => {
    expect(() => normalizeParticipantSelection("everyone", ["a"])).toThrow(/Everyone/);
    expect(() => normalizeParticipantSelection("selected", [])).toThrow(/at least one/);
  });

  it("preserves the legacy ID-based fallback", () => {
    expect(normalizeParticipantSelection(undefined, [])).toEqual({
      participantScope: "everyone",
      travelerIds: []
    });
    expect(normalizeParticipantSelection(undefined, ["a"])).toEqual({
      participantScope: "selected",
      travelerIds: ["a"]
    });
  });
});
