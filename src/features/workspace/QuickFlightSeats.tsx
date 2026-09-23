import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Armchair, ChevronDown, Loader2, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getErrorMessage } from "../trips/presentation";
import { listFlightTravelers, setFlightTravelerDetails } from "./api";
import type { FlightLeg, Traveler } from "./types";

/** Seat-only shortcut; the full passenger editor still owns the other fields. */
export function QuickFlightSeats({
  tripId,
  flight,
  travelers
}: {
  tripId: string;
  flight: FlightLeg;
  travelers: Traveler[];
}) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["flight-travelers", flight.id],
    queryFn: () => listFlightTravelers(flight.id),
    enabled: open
  });
  const mutation = useMutation({
    mutationFn: setFlightTravelerDetails,
    onSuccess: async () => {
      setSaved(
        navigator.onLine ? "Seat saved." : "Seat saved on this device. Will sync when online."
      );
      await queryClient.invalidateQueries({ queryKey: ["flight-travelers"] });
    }
  });
  const save = (event: FormEvent<HTMLFormElement>, travelerId: string) => {
    event.preventDefault();
    setSaved("");
    const row = query.data?.find((value) => value.traveler_id === travelerId);
    mutation.mutate({
      tripId,
      flightLegId: flight.id,
      travelerId,
      seat: String(new FormData(event.currentTarget).get("seat") ?? "")
        .trim()
        .toUpperCase(),
      boardingGroup: row?.boarding_group ?? "",
      ticketNumber: row?.ticket_number ?? ""
    });
  };
  if (!travelers.length) return null;
  const route = `${flight.departure_airport_code || flight.departure_airport_name} → ${flight.arrival_airport_code || flight.arrival_airport_name}`;
  return (
    <section className="mt-3 rounded-xl border border-line px-3 py-2">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-2 text-left text-sm font-bold text-brand"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Armchair aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 flex-1">Seats · {route}</span>
        <ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-2 pb-1">
          {query.isPending && (
            <p role="status" className="text-sm text-muted">
              Loading seats…
            </p>
          )}
          {query.error && (
            <p role="alert" className="text-sm text-danger">
              Could not load seats.{" "}
              <button className="underline" onClick={() => void query.refetch()}>
                Retry
              </button>
            </p>
          )}
          {query.isSuccess &&
            travelers.map((traveler) => {
              const row = query.data.find((value) => value.traveler_id === traveler.id);
              return (
                <form
                  key={`${traveler.id}:${row?.seat ?? ""}`}
                  onSubmit={(event) => save(event, traveler.id)}
                  className="flex items-center gap-2"
                >
                  <label className="flex min-w-0 flex-1 items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{traveler.display_name}</span>
                    <input
                      className="form-input w-24 shrink-0 uppercase"
                      name="seat"
                      aria-label={`Seat for ${traveler.display_name}`}
                      defaultValue={row?.seat ?? ""}
                      placeholder="12A"
                      maxLength={20}
                      autoComplete="off"
                      disabled={mutation.isPending}
                    />
                  </label>
                  <button
                    className="secondary-button min-h-11 px-3"
                    aria-label={`Save seat for ${traveler.display_name}`}
                    disabled={mutation.isPending || query.isFetching}
                  >
                    {mutation.isPending && mutation.variables?.travelerId === traveler.id ? (
                      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <Save aria-hidden="true" className="size-4" />
                    )}
                  </button>
                </form>
              );
            })}
          {mutation.error && (
            <p role="alert" className="text-sm text-danger">
              {getErrorMessage(mutation.error)}
            </p>
          )}
          {saved && (
            <p role="status" className="text-xs text-muted">
              {saved}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
