import { Plus, Trash2 } from "lucide-react";
import type { ItineraryItem } from "../trips/types";

export function CabStopsFields({
  stopKeys,
  itinerary,
  currencyCode,
  onAdd,
  onRemove
}: {
  stopKeys: string[];
  itinerary: ItineraryItem[];
  currencyCode: string;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-surface/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold">Stops during this cab journey (optional)</p>
          <p className="mt-1 max-w-xl text-xs leading-5 text-muted">
            Add sightseeing, meals, pickups, or other intermediate stops. Link a stop to an existing
            timeline event only when it should appear there separately.
          </p>
        </div>
        <button
          type="button"
          className="secondary-button min-h-9 px-3 py-2 text-xs"
          onClick={onAdd}
        >
          <Plus className="size-3.5" /> Add stop
        </button>
      </div>
      {stopKeys.length > 0 && (
        <div className="mt-4 space-y-3">
          {stopKeys.map((key, index) => {
            const prefix = `cab.stop.${key}`;
            return (
              <details key={key} className="rounded-xl border border-line bg-elevated p-3" open>
                <summary className="cursor-pointer text-sm font-extrabold">
                  Stop {index + 1}
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="form-label">
                    Stop name <span aria-hidden="true">*</span>
                    <input
                      className="form-input"
                      name={`${prefix}.title`}
                      required
                      placeholder="Lunch, attraction, hotel…"
                    />
                  </label>
                  <label className="form-label">
                    Place
                    <input
                      className="form-input"
                      name={`${prefix}.location`}
                      placeholder="Address or pickup point"
                    />
                  </label>
                  <label className="form-label">
                    Arrive (optional)
                    <input
                      className="form-input"
                      type="datetime-local"
                      name={`${prefix}.arrivesAt`}
                    />
                  </label>
                  <label className="form-label">
                    Leave (optional)
                    <input
                      className="form-input"
                      type="datetime-local"
                      name={`${prefix}.departsAt`}
                    />
                  </label>
                  <label className="form-label sm:col-span-2">
                    Link to a timeline event (optional)
                    <select className="form-input" name={`${prefix}.linkedItineraryItemId`}>
                      <option value="">Keep only inside this cab journey</option>
                      {itinerary.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-label sm:col-span-2">
                    Google Maps link (optional)
                    <input
                      className="form-input"
                      type="url"
                      name={`${prefix}.mapUrl`}
                      placeholder="https://maps.google.com/…"
                    />
                  </label>
                  <label className="form-label sm:col-span-2">
                    Notes (optional)
                    <textarea className="form-input min-h-20" name={`${prefix}.notes`} />
                  </label>
                  <label className="form-label">
                    Extra cost (optional)
                    <div className="form-input flex items-center gap-2">
                      <span className="text-xs font-bold text-muted">{currencyCode}</span>
                      <input
                        className="min-w-0 flex-1 bg-transparent outline-none"
                        inputMode="decimal"
                        name={`${prefix}.costAmount`}
                        aria-label="Extra cost (optional)"
                        placeholder="0.00"
                      />
                    </div>
                  </label>
                  <label className="form-label">
                    Payment
                    <select
                      className="form-input"
                      name={`${prefix}.paymentStatus`}
                      defaultValue="planned"
                    >
                      <option value="planned">Planned / unpaid</option>
                      <option value="paid">Paid</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  className="secondary-button mt-3 min-h-9 px-3 py-2 text-xs text-danger"
                  onClick={() => onRemove(key)}
                >
                  <Trash2 className="size-3.5" /> Remove stop
                </button>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
