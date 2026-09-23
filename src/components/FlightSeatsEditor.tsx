import { Armchair, ChevronDown, Loader2, Save } from "lucide-react";

/** Shared by real flights and the sandbox demo; persistence belongs to the caller. */
export function FlightSeatsEditor({
  route,
  travelers,
  seats,
  open,
  onOpenChange,
  onSave,
  loading = false,
  refreshing = false,
  loadError = false,
  onRetry,
  savingTravelerId,
  error,
  message
}: {
  route: string;
  travelers: { id: string; display_name: string }[];
  seats: { traveler_id: string; seat: string | null }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (travelerId: string, seat: string) => void;
  loading?: boolean;
  refreshing?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  savingTravelerId?: string;
  error?: string;
  message?: string;
}) {
  if (!travelers.length) return null;
  return (
    <section className="mt-3 rounded-xl border border-line px-3 py-2">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-bold text-brand"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <Armchair aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">Seats · {route}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 pb-1">
          {loading && (
            <p role="status" className="text-sm text-muted">
              Loading seats…
            </p>
          )}
          {loadError && (
            <p role="alert" className="text-sm text-danger">
              Could not load seats.{" "}
              <button type="button" className="underline" onClick={onRetry}>
                Retry
              </button>
            </p>
          )}
          {!loading &&
            !loadError &&
            travelers.map((traveler) => {
              const seat = seats.find((row) => row.traveler_id === traveler.id)?.seat ?? "";
              return (
                <form
                  key={`${traveler.id}:${seat}`}
                  className="flex items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    onSave(
                      traveler.id,
                      String(new FormData(event.currentTarget).get("seat") ?? "")
                        .trim()
                        .toUpperCase()
                    );
                  }}
                >
                  <label className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{traveler.display_name}</span>
                    <input
                      className="form-input seat-input !mt-0 !w-24 shrink-0 uppercase"
                      name="seat"
                      aria-label={`Seat for ${traveler.display_name}`}
                      defaultValue={seat}
                      placeholder="e.g. 12A"
                      maxLength={20}
                      autoComplete="off"
                      disabled={Boolean(savingTravelerId)}
                    />
                  </label>
                  <button
                    className="secondary-button min-h-11 px-3"
                    aria-label={`Save seat for ${traveler.display_name}`}
                    disabled={Boolean(savingTravelerId) || refreshing}
                  >
                    {savingTravelerId === traveler.id ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Save aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </form>
              );
            })}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {message && (
            <p role="status" className="text-xs text-muted">
              {message}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
