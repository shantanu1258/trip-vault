import { describe, expect, it } from "vitest";
import { calculatePackState, missingPackBytes } from "./offlinePack";

describe("offline readiness", () => {
  it("marks a full verified manifest ready", () =>
    expect(calculatePackState(["a", "b"], ["b", "a"])).toBe("ready"));
  it("distinguishes an essentials-only pack", () =>
    expect(calculatePackState(["a"], ["a"], true)).toBe("essentials_ready"));
  it("does not report readiness when a version is missing", () =>
    expect(calculatePackState(["a", "b"], ["a"])).toBe("failed"));
  it("calculates only the missing document bytes", () =>
    expect(
      missingPackBytes(
        [
          { current_version: { id: "a", byte_size: 120 } },
          { current_version: { id: "b", byte_size: 80 } },
          { current_version: null }
        ],
        ["a"]
      )
    ).toBe(80));
});
