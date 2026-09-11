import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { listFlightTravelers, setFlightTravelerDetails } from "./api";
import type { Traveler } from "./types";

export function FlightTravelerDetails({ tripId, flightLegId, travelers, canEdit = false }: { tripId: string; flightLegId: string; travelers: Traveler[]; canEdit?: boolean }) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const query = useQuery({ queryKey: ["flight-travelers", flightLegId], queryFn: () => listFlightTravelers(flightLegId) });
  const mutation = useMutation({ mutationFn: setFlightTravelerDetails, onSuccess: async () => { setMessage("Traveler details saved."); await queryClient.invalidateQueries({ queryKey: ["flight-travelers", flightLegId] }); } });
  const byTraveler = new Map((query.data ?? []).map((row) => [row.traveler_id, row]));

  const save = (event: FormEvent<HTMLFormElement>, travelerId: string) => {
    event.preventDefault(); setMessage("");
    const form = new FormData(event.currentTarget);
    mutation.mutate({ tripId, flightLegId, travelerId, seat: String(form.get("seat") ?? "").trim(), boardingGroup: String(form.get("boardingGroup") ?? "").trim(), ticketNumber: String(form.get("ticketNumber") ?? "").trim() });
  };

  if (!travelers.length) return null;
  return <section className="surface-card mt-5 p-5"><p className="flex items-center gap-2 font-display text-xl font-black"><UsersRound className="size-5 text-brand" /> Traveler flight details</p><p className="mt-2 text-sm text-muted">Seats, boarding groups, and ticket numbers are entered manually and remain sensitive trip data.</p><div className="mt-4 space-y-3">{travelers.map((traveler) => { const row = byTraveler.get(traveler.id); return canEdit ? <form key={traveler.id} onSubmit={(event) => save(event, traveler.id)} className="rounded-2xl border border-line bg-elevated p-4"><p className="font-bold">{traveler.display_name}</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[7rem_8rem_minmax(0,1fr)_auto]"><label className="form-label text-xs">Seat<input className="form-input" name="seat" defaultValue={row?.seat ?? ""} placeholder="Enter the seat printed on the boarding pass" /></label><label className="form-label text-xs">Boarding group<input className="form-input" name="boardingGroup" defaultValue={row?.boarding_group ?? ""} placeholder="Enter the boarding group, if provided" /></label><label className="form-label col-span-2 text-xs sm:col-span-1">Ticket number<input className="form-input" name="ticketNumber" defaultValue={row?.ticket_number ?? ""} placeholder="Enter the passenger ticket number" /></label><button className="secondary-button self-end" disabled={mutation.isPending} aria-label={`Save flight details for ${traveler.display_name}`}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}</button></div></form> : <article key={traveler.id} className="rounded-2xl border border-line bg-elevated p-4"><p className="font-bold">{traveler.display_name}</p><p className="mt-2 text-sm text-muted">Seat {row?.seat || "—"} · {row?.boarding_group || "Boarding group —"}{row?.ticket_number ? ` · Ticket ${row.ticket_number}` : ""}</p></article>; })}</div>{(message || mutation.error) && <p role="status" className={`mt-3 text-sm font-bold ${mutation.error ? "text-danger" : "text-success"}`}>{mutation.error ? "Could not save traveler flight details." : message}</p>}</section>;
}
