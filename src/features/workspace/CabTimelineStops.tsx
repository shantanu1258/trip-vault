import { MapPin } from "lucide-react";
import { formatEventTime } from "../trips/presentation";
import type { CabStop } from "./types";

export function CabTimelineStops({
  stops,
  eventTimezone
}: {
  stops: CabStop[];
  eventTimezone: string;
}) {
  if (!stops.length) return null;

  const visibleStops = stops.slice(0, 3);
  return (
    <div className="mt-2 border-t border-line/70 pt-2" aria-label="Cab journey stops">
      <p className="font-black text-ink">Stops</p>
      <ol className="mt-1 space-y-1">
        {visibleStops.map((stop, index) => {
          const time = stop.arrives_at ?? stop.departs_at;
          return (
            <li key={stop.id} className="flex min-w-0 items-center gap-1.5 text-muted">
              <MapPin className="size-3 shrink-0 text-brand" />
              <span className="min-w-0 truncate">
                {index + 1}. {stop.title}
              </span>
              {time && <span className="shrink-0">· {formatEventTime(time, eventTimezone)}</span>}
            </li>
          );
        })}
      </ol>
      {stops.length > visibleStops.length && (
        <p className="mt-1 font-bold text-brand">
          +{stops.length - visibleStops.length} more stops
        </p>
      )}
    </div>
  );
}
