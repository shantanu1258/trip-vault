import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ProgressiveList } from "../../components/ProgressiveList";
import { getReleaseSnapshot, type ConfigRelease } from "./api";
import { AdminQueryState } from "./AdminUi";
import { comparisonRelease, diffReleaseSnapshots, formatChangeValue } from "./releaseChanges";

export function ReleaseChangesPanel({
  release,
  releases
}: {
  release: ConfigRelease;
  releases: ConfigRelease[];
}) {
  const [open, setOpen] = useState(false);
  const baseline = comparisonRelease(release, releases);
  const query = useQuery({
    queryKey: ["admin-release-changes", release.id, baseline?.id ?? "empty"],
    enabled: open,
    staleTime: 0,
    queryFn: async () => {
      const [before, after] = await Promise.all([
        baseline ? getReleaseSnapshot(baseline.id) : Promise.resolve({}),
        getReleaseSnapshot(release.id)
      ]);
      return diffReleaseSnapshots(before, after);
    }
  });
  return (
    <div className="mt-3 border-t border-line pt-2">
      <button
        type="button"
        className="min-h-11 text-sm font-bold text-brand"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Hide changes" : "View changes"}
      </button>
      {open && (
        <div className="pb-2">
          <p className="mb-3 text-xs text-muted">
            {baseline
              ? `Compared with version ${baseline.version_number}${release.status === "draft" ? " (currently live)" : ""}`
              : "Initial configuration · No previous published release"}
          </p>
          <AdminQueryState
            loading={query.isFetching && !query.data}
            error={query.error}
            empty={query.isSuccess && query.data.length === 0}
            emptyMessage="No configuration changes."
          />
          {query.isError && (
            <button className="secondary-button mt-2" onClick={() => void query.refetch()}>
              Retry changes
            </button>
          )}
          {query.isSuccess && query.data.length > 0 && (
            <>
              <p className="mb-3 text-xs font-bold">
                {["Added", "Edited", "Removed"]
                  .map(
                    (kind) =>
                      `${query.data.filter((item) => item.kind === kind).length} ${kind.toLowerCase()}`
                  )
                  .join(" · ")}
              </p>
              {query.data.some(
                (item) =>
                  item.kind === "Removed" &&
                  ["Airlines", "Airports", "Booking vendors"].includes(item.section)
              ) && (
                <p className="mb-3 text-xs text-muted">
                  Catalogue removals remove release overrides. Built-in entries may still appear in
                  the app.
                </p>
              )}
              <ProgressiveList
                items={query.data}
                initialCount={12}
                itemLabel="changes"
                getKey={(item) => item.key}
                renderItem={(item) => (
                  <details className="rounded-xl border border-line p-3">
                    <summary className="cursor-pointer break-words text-sm">
                      <span className="font-bold">{item.name}</span>
                      <span className="ml-2 text-xs text-muted">
                        {item.section} · {item.kind}
                      </span>
                    </summary>
                    <dl className="mt-3 space-y-3 text-xs">
                      {item.fields.map((field) => (
                        <div key={field.name}>
                          <dt className="font-bold capitalize">
                            {field.name.replaceAll("_", " ")}
                          </dt>
                          <dd className="mt-1 grid gap-1 break-words [overflow-wrap:anywhere] sm:grid-cols-2">
                            <span className="text-muted">
                              Before: {formatChangeValue(field.before)}
                            </span>
                            <span>After: {formatChangeValue(field.after)}</span>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
