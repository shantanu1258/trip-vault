import { expect, it } from "vitest";
import { comparisonRelease, diffReleaseSnapshots } from "./releaseChanges";
import type { ConfigRelease } from "./api";

it("compares content by stable identity, ignoring row IDs, timestamps and JSON key order", () => {
  const before = {
    Airlines: [{ id: "old", stable_key: "air", name: "Air", updated_at: "old", aliases: ["A"] }],
    Defaults: [{ namespace: "booking", key: "display", value: { a: 1, b: 2 } }]
  };
  const after = {
    Airlines: [{ id: "new", stable_key: "air", name: "Air", updated_at: "new", aliases: ["A"] }],
    Defaults: [{ namespace: "booking", key: "display", value: { b: 2, a: 1 } }]
  };
  expect(diffReleaseSnapshots(before, after)).toEqual([]);
});

it("includes added, removed and before/after field edits across catalogues and palettes", () => {
  const changes = diffReleaseSnapshots(
    {
      Airlines: [
        { stable_key: "old", name: "Old Air" },
        { stable_key: "air", name: "Air", is_enabled: true }
      ],
      Appearance: [{ stable_key: "light", name: "Light palette", brand: "#000000" }]
    },
    {
      Airlines: [
        { stable_key: "new", name: "New Air" },
        { stable_key: "air", name: "Air", is_enabled: false }
      ],
      Appearance: [{ stable_key: "light", name: "Light palette", brand: "#ffffff" }]
    }
  );
  expect(changes.map((change) => change.kind)).toEqual(["Removed", "Edited", "Added", "Edited"]);
  expect(changes[1].fields).toEqual([{ name: "is_enabled", before: true, after: false }]);
  expect(changes[3].fields).toEqual([{ name: "brand", before: "#000000", after: "#ffffff" }]);
});

it("compares stale drafts to live config and rollback releases to the prior published version", () => {
  const v1 = { id: "v1", version_number: 1, status: "retired" } as ConfigRelease;
  const v2 = { id: "v2", version_number: 2, status: "retired" } as ConfigRelease;
  const v3 = {
    id: "v3",
    version_number: 3,
    status: "published",
    based_on_release_id: "v1"
  } as ConfigRelease;
  const draft = {
    id: "draft",
    version_number: null,
    status: "draft",
    based_on_release_id: null
  } as ConfigRelease;
  const releases = [draft, v1, v3, v2];
  expect(comparisonRelease(draft, releases)).toBe(v3);
  expect(comparisonRelease(v3, releases)).toBe(v2);
  expect(comparisonRelease(v1, releases)).toBeUndefined();
});
