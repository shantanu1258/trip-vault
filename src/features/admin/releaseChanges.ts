import type { ConfigRelease } from "./api";

export type ReleaseSnapshot = Record<string, Record<string, unknown>[]>;
export type ReleaseChange = {
  key: string;
  section: string;
  name: string;
  kind: "Added" | "Removed" | "Edited";
  fields: { name: string; before: unknown; after: unknown }[];
};

const bookkeeping = new Set(["id", "config_release_id", "updated_by", "updated_at"]);
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function rowKey(row: Record<string, unknown>) {
  return String(row.stable_key ?? JSON.stringify([row.namespace, row.key]));
}

/** Drafts show their effect on live config; history shows the previous published version,
 * not the copied source (which can differ for old drafts and rollback releases). */
export function comparisonRelease(release: ConfigRelease, releases: ConfigRelease[]) {
  if (release.status === "draft") return releases.find((item) => item.status === "published");
  return releases
    .filter(
      (item) => item.version_number !== null && item.version_number < (release.version_number ?? 0)
    )
    .sort((a, b) => b.version_number! - a.version_number!)[0];
}

export function diffReleaseSnapshots(
  before: ReleaseSnapshot,
  after: ReleaseSnapshot
): ReleaseChange[] {
  const changes: ReleaseChange[] = [];
  for (const section of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const oldRows = new Map((before[section] ?? []).map((row) => [rowKey(row), row]));
    const newRows = new Map((after[section] ?? []).map((row) => [rowKey(row), row]));
    for (const key of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const oldRow = oldRows.get(key),
        newRow = newRows.get(key);
      const fields = [...new Set([...Object.keys(oldRow ?? {}), ...Object.keys(newRow ?? {})])]
        .filter((field) => !bookkeeping.has(field) && field !== "stable_key")
        .filter((field) => canonical(oldRow?.[field]) !== canonical(newRow?.[field]))
        .map((name) => ({ name, before: oldRow?.[name], after: newRow?.[name] }));
      if (!oldRow || !newRow || fields.length)
        changes.push({
          key: `${section}:${key}`,
          section,
          name: String(newRow?.name ?? oldRow?.name ?? key),
          kind: !oldRow ? "Added" : !newRow ? "Removed" : "Edited",
          fields
        });
    }
  }
  return changes;
}

export function formatChangeValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "object" ? canonical(value) : String(value);
}
