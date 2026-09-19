import type { TripView } from "./navigation";

export function TripViewTabs({
  view,
  onChange
}: {
  view: TripView;
  onChange: (view: TripView) => void;
}) {
  return (
    <>
      <div data-trip-sticky-start aria-hidden="true" />
      <nav
        data-trip-sticky
        aria-label="Trip views"
        className="sticky top-[var(--app-header-height)] z-30 mt-3 border-b border-line bg-canvas/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-2">
          {(
            [
              ["timeline", "Timeline"],
              ["details", "Trip details"]
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => onChange(value)}
              className={`tap-target min-h-11 border-b-2 px-3 text-sm font-bold transition-colors ${view === value ? "border-brand text-brand" : "border-transparent text-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
