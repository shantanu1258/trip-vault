import { TripChildLink } from "../../components/TripChildLink";
export function CollectionCounts({
  values,
  tripId,
  collection = "reservations",
  navigationState,
  selectedKey,
  onSelect
}: {
  values: Array<{ key: string; label: string; count: number }>;
  tripId?: string;
  collection?: "reservations" | "documents";
  navigationState?: unknown;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}) {
  const visible = values.filter((value) => value.count > 0);
  if (!visible.length) return null;

  return (
    <div className="mb-3 flex flex-wrap gap-1.5" aria-label="Section summary">
      {visible.map((value) =>
        tripId ? (
          <TripChildLink
            tripId={tripId}
            key={value.label}
            to={`/trips/${tripId}/${collection}?category=${encodeURIComponent(value.key)}`}
            state={navigationState}
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[.7rem] font-bold text-muted hover:border-brand hover:text-ink"
          >
            {value.label} <strong className="text-ink">{value.count}</strong>
          </TripChildLink>
        ) : onSelect ? (
          <button
            key={value.key}
            type="button"
            onClick={() => onSelect(value.key)}
            aria-pressed={selectedKey === value.key}
            className={`inline-flex min-h-9 items-center gap-1 rounded-full border border-line px-2.5 py-1 text-[.7rem] font-bold ${selectedKey === value.key ? "bg-brand text-surface" : "bg-surface text-muted"}`}
          >
            {value.label} <strong>{value.count}</strong>
          </button>
        ) : (
          <span
            key={value.label}
            className="inline-flex min-h-9 items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-[.7rem] font-bold text-muted"
          >
            {value.label} <strong className="text-ink">{value.count}</strong>
          </span>
        )
      )}
    </div>
  );
}
