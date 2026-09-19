import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { isSupabaseConfigured } from "../../lib/supabase/client";
import { deriveAlerts } from "../alerts/engine";
import { alertInputsQueryOptions } from "../alerts/load";
import { selectFocusedTrip } from "./presentation";
import type { Trip } from "./types";

/** The former Home urgency card, sharing the header's cached alert inputs. */
export function TripAttentionCard({ trips }: { trips: Trip[] }) {
  const queryClient = useQueryClient();
  const focusedTrip = selectFocusedTrip(trips.filter((trip) => trip.status !== "archived"));
  const alerts = useQuery({
    ...alertInputsQueryOptions(queryClient),
    enabled: isSupabaseConfigured && Boolean(focusedTrip)
  });
  const alert =
    focusedTrip && alerts.data
      ? deriveAlerts(alerts.data).find(
          (item) => item.group === "urgent" && (!item.tripId || item.tripId === focusedTrip.id)
        )
      : undefined;
  if (!alert) return null;

  return (
    <Link
      to={alert.target ?? "/alerts"}
      className="mt-4 flex min-w-0 items-start gap-3 rounded-2xl border border-danger/35 bg-danger/10 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
      aria-label={`Review now: ${alert.title}`}
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-muted">
          {alert.tripId ? focusedTrip?.title : "Needs attention"}
        </p>
        <h2 className="mt-1 break-words text-base font-bold">{alert.title}</h2>
        <p className="mt-1 text-sm text-muted">{alert.detail}</p>
        <span className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-danger">
          Review now <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
