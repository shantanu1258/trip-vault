import { BookingDisclosure } from "./BookingDetailSections";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { listFlightTravelers, setFlightTravelerDetails } from "./api";
import type { Traveler } from "./types";

export function FlightTravelerDetails({
  tripId,
  flightLegId,
  travelers,
  canEdit = false
}: {
  tripId: string;
  flightLegId: string;
  travelers: Traveler[];
  canEdit?: boolean;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["flight-travelers", flightLegId],
    queryFn: () => listFlightTravelers(flightLegId)
  });
  const mutation = useMutation({
    mutationFn: setFlightTravelerDetails,
    onSuccess: async () => {
      setMessage("Traveler details saved.");
      await queryClient.invalidateQueries({ queryKey: ["flight-travelers", flightLegId] });
    }
  });
  const byTraveler = new Map((query.data ?? []).map((row) => [row.traveler_id, row]));

  const save = (event: FormEvent<HTMLFormElement>, travelerId: string) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      tripId,
      flightLegId,
      travelerId,
      seat: String(form.get("seat") ?? "").trim(),
      boardingGroup: String(form.get("boardingGroup") ?? "").trim(),
      ticketNumber: String(form.get("ticketNumber") ?? "").trim()
    });
  };

  if (!travelers.length) return null;
  if (query.isLoading)
    return (
      <p role="status" className="p-3 text-sm text-muted">
        Loading passenger details…
      </p>
    );
  if (query.error)
    return (
      <p role="alert" className="p-3 text-sm text-danger">
        Could not load passenger details. Please try again.
      </p>
    );
  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <p className="flex items-center gap-2 font-display text-base font-black">
        <UsersRound className="size-5 text-brand" /> Traveler flight details
      </p>

      <div className="mt-3 space-y-2">
        {travelers.map((traveler) => {
          const row = byTraveler.get(traveler.id);
          return canEdit ? (
            <BookingDisclosure
              key={`${traveler.id}:${row?.seat ?? ""}:${row?.boarding_group ?? ""}:${row?.ticket_number ?? ""}`}
              title={`${traveler.display_name}${row?.seat ? ` · Seat ${row.seat}` : ""}${row?.boarding_group ? ` · Group ${row.boarding_group}` : ""}`}
              hint={
                row?.ticket_number ? `Ticket ${row.ticket_number} · Edit` : "Edit passenger details"
              }
            >
              <form
                onSubmit={(event) => save(event, traveler.id)}
                className="rounded-lg bg-surface"
              >
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[7rem_8rem_minmax(0,1fr)_auto]">
                  <label className="form-label text-xs">
                    Seat
                    <input
                      className="form-input seat-input"
                      name="seat"
                      defaultValue={row?.seat ?? ""}
                      placeholder="e.g. 12A"
                    />
                  </label>
                  <label className="form-label text-xs">
                    Boarding group
                    <input
                      className="form-input"
                      name="boardingGroup"
                      defaultValue={row?.boarding_group ?? ""}
                      placeholder="Enter the boarding group, if provided"
                    />
                  </label>
                  <label className="form-label col-span-2 text-xs sm:col-span-1">
                    Ticket number
                    <input
                      className="form-input"
                      name="ticketNumber"
                      defaultValue={row?.ticket_number ?? ""}
                      placeholder="Enter the passenger ticket number"
                    />
                  </label>
                  <button
                    className="secondary-button self-end"
                    disabled={mutation.isPending}
                    aria-label={`Save flight details for ${traveler.display_name}`}
                  >
                    {mutation.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                  </button>
                </div>
              </form>
            </BookingDisclosure>
          ) : (
            <article key={traveler.id} className="rounded-lg bg-surface">
              <p className="text-lg font-extrabold">{traveler.display_name}</p>
              <p className="mt-2 text-sm text-muted">
                Seat {row?.seat || "—"} · {row?.boarding_group || "Boarding group —"}
                {row?.ticket_number ? ` · Ticket ${row.ticket_number}` : ""}
              </p>
            </article>
          );
        })}
      </div>
      {(message || mutation.error) && (
        <p
          role="status"
          className={`mt-3 text-sm font-bold ${mutation.error ? "text-danger" : "text-success"}`}
        >
          {mutation.error ? "Could not save traveler flight details." : message}
        </p>
      )}
    </section>
  );
}
