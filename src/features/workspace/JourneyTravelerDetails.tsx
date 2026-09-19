import { BookingDisclosure } from "./BookingDetailSections";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, UsersRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getErrorMessage } from "../trips/presentation";
import { listJourneyLegTravelers, setJourneyLegTravelerDetails } from "./api";
import type { JourneyLeg, JourneyLegTraveler, JourneyMode, Traveler } from "./types";

const fieldLabels: Record<
  Exclude<JourneyMode, "cab">,
  { seat: string; coach: string; reference: string }
> = {
  train: { seat: "Seat / berth", coach: "Coach", reference: "Passenger PNR / reference" },
  bus: { seat: "Seat", coach: "Coach / section", reference: "Passenger PNR / reference" },
  ferry: { seat: "Seat / berth", coach: "Cabin / accommodation", reference: "Passenger reference" }
};

function travelerFieldVisibility(leg: JourneyLeg) {
  if (leg.mode === "train") return { seat: true, coach: true };
  if (leg.mode === "bus") return { seat: true, coach: false };
  const assignedFerry =
    leg.mode === "ferry" && leg.details?.kind === "ferry" && leg.details.seating === "assigned";
  return { seat: assignedFerry, coach: assignedFerry };
}

function allocationDetails(
  row: JourneyLegTraveler | undefined,
  leg: JourneyLeg,
  includeReference = true
) {
  if (!row) return [];
  if (leg.mode === "cab") return [];
  const labels = fieldLabels[leg.mode];
  const fields = travelerFieldVisibility(leg);
  return [
    fields.seat && row.seat_or_berth ? `${labels.seat} ${row.seat_or_berth}` : null,
    fields.coach && row.coach_or_cabin ? `${labels.coach} ${row.coach_or_cabin}` : null,
    includeReference && row.passenger_reference
      ? `${labels.reference} ${row.passenger_reference}`
      : null
  ].filter((value): value is string => Boolean(value));
}

function legLabel(leg: JourneyLeg, index?: number, count?: number) {
  const route = `${leg.origin_code || leg.origin_name} → ${leg.destination_code || leg.destination_name}`;
  return count && count > 1 ? `Connection ${(index ?? 0) + 1} · ${route}` : route;
}

export function JourneyTravelerBadges({
  tripId,
  leg,
  travelers,
  focusedTravelerId,
  inverse = false,
  legIndex,
  legCount
}: {
  tripId: string;
  leg: JourneyLeg;
  travelers: Traveler[];
  focusedTravelerId?: string | null;
  inverse?: boolean;
  legIndex?: number;
  legCount?: number;
}) {
  const query = useQuery({
    queryKey: ["journey-leg-travelers", leg.id],
    queryFn: () => listJourneyLegTravelers(leg.id, tripId),
    enabled: leg.mode !== "cab"
  });
  const visibleTravelerIds = new Set(travelers.map((traveler) => traveler.id));
  if (leg.mode === "cab") return null;
  const rows = (query.data ?? [])
    .filter((row) => visibleTravelerIds.has(row.traveler_id))
    .filter((row) => !focusedTravelerId || row.traveler_id === focusedTravelerId)
    .map((row) => ({
      row,
      traveler: travelers.find((traveler) => traveler.id === row.traveler_id),
      details: allocationDetails(row, leg, false)
    }))
    .filter(({ details }) => details.length > 0);
  const fields = travelerFieldVisibility(leg);
  const legacy = [
    fields.coach ? leg.coach_or_cabin : null,
    fields.seat && leg.seat ? `Seat ${leg.seat}` : null
  ]
    .filter(Boolean)
    .join(" · ");
  if (
    !rows.length &&
    travelers.length > 0 &&
    query.isSuccess &&
    query.data.length === 0 &&
    legacy
  ) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${leg.mode} traveler details`}>
        <span
          className={`rounded-lg px-2 py-1 font-bold ${inverse ? "bg-surface/10 text-surface" : "bg-brand-soft text-brand"}`}
        >
          {legCount && legCount > 1 ? `Connection ${(legIndex ?? 0) + 1} · ` : ""}
          {legacy}
        </span>
      </div>
    );
  }
  if (!rows.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`${leg.mode} traveler details`}>
      {rows.map(({ row, traveler, details }) => (
        <span
          key={row.id}
          className={`rounded-lg px-2 py-1 font-bold ${inverse ? "bg-surface/10 text-surface" : "bg-brand-soft text-brand"}`}
        >
          {legCount && legCount > 1 ? `Connection ${(legIndex ?? 0) + 1} · ` : ""}
          {traveler?.display_name ?? "Traveler"} · {details.join(" · ")}
        </span>
      ))}
    </div>
  );
}

function JourneyTravelerLegDetails({
  tripId,
  leg,
  travelers,
  canEdit,
  index,
  count
}: {
  tripId: string;
  leg: JourneyLeg;
  travelers: Traveler[];
  canEdit: boolean;
  index: number;
  count: number;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const query = useQuery({
    queryKey: ["journey-leg-travelers", leg.id],
    queryFn: () => listJourneyLegTravelers(leg.id, tripId)
  });
  const mutation = useMutation({
    mutationFn: setJourneyLegTravelerDetails,
    onSuccess: async () => {
      setMessage("Traveler journey details saved.");
      await queryClient.invalidateQueries({ queryKey: ["journey-leg-travelers", leg.id] });
    }
  });
  if (leg.mode === "cab") return null;
  const byTraveler = new Map((query.data ?? []).map((row) => [row.traveler_id, row]));
  const labels = fieldLabels[leg.mode];
  const fields = travelerFieldVisibility(leg);
  const save = (event: FormEvent<HTMLFormElement>, travelerId: string) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    mutation.mutate({
      tripId,
      journeyLegId: leg.id,
      travelerId,
      seatOrBerth: fields.seat
        ? String(form.get("seatOrBerth") ?? "").trim()
        : (byTraveler.get(travelerId)?.seat_or_berth ?? undefined),
      coachOrCabin: fields.coach
        ? String(form.get("coachOrCabin") ?? "").trim()
        : (byTraveler.get(travelerId)?.coach_or_cabin ?? undefined),
      passengerReference: String(form.get("passengerReference") ?? "").trim()
    });
  };

  if (query.isLoading)
    return (
      <section
        className="rounded-lg bg-surface"
        aria-label={`${legLabel(leg, index, count)} traveler details`}
      >
        <p className="font-display text-base font-black">{legLabel(leg, index, count)}</p>
        <p className="mt-3 text-sm text-muted" role="status">
          Loading passenger details…
        </p>
      </section>
    );
  if (query.error)
    return (
      <section
        className="rounded-lg bg-surface"
        aria-label={`${legLabel(leg, index, count)} traveler details`}
      >
        <p className="font-display text-base font-black">{legLabel(leg, index, count)}</p>
        <p className="mt-3 text-sm font-bold text-danger" role="alert">
          {getErrorMessage(query.error)}
        </p>
      </section>
    );

  return (
    <section
      className="rounded-lg bg-surface"
      aria-label={`${legLabel(leg, index, count)} traveler details`}
    >
      <p className="font-display text-base font-black">{legLabel(leg, index, count)}</p>
      <div className="mt-2 space-y-2">
        {travelers.map((traveler) => {
          const row = byTraveler.get(traveler.id);
          const details = allocationDetails(row, leg);
          if (!canEdit)
            return (
              <article key={traveler.id} className="rounded-xl bg-surface p-3">
                <p className="text-lg font-extrabold">{traveler.display_name}</p>
                <p className="mt-1 text-sm text-muted">
                  {details.length ? details.join(" · ") : "Passenger details not added"}
                </p>
              </article>
            );
          return (
            <BookingDisclosure
              key={`${traveler.id}:${row?.seat_or_berth ?? ""}:${row?.coach_or_cabin ?? ""}:${row?.passenger_reference ?? ""}`}
              title={`${traveler.display_name}${details.filter((value) => !value.startsWith(labels.reference)).length ? ` · ${details.filter((value) => !value.startsWith(labels.reference)).join(" · ")}` : ""}`}
              hint={
                row?.passenger_reference
                  ? `Ref ${row.passenger_reference} · Edit`
                  : "Edit passenger details"
              }
            >
              <form
                onSubmit={(event) => save(event, traveler.id)}
                className="rounded-xl bg-surface p-3"
              >
                <div
                  className={`mt-3 grid gap-3 ${fields.coach ? "sm:grid-cols-[minmax(7rem,0.8fr)_minmax(8rem,1fr)_minmax(10rem,1.4fr)_auto]" : fields.seat ? "sm:grid-cols-[minmax(7rem,0.8fr)_minmax(10rem,1.4fr)_auto]" : "sm:grid-cols-[minmax(10rem,1fr)_auto]"}`}
                >
                  {fields.seat && (
                    <label className="form-label text-xs">
                      {labels.seat}
                      <input
                        className="form-input"
                        name="seatOrBerth"
                        defaultValue={row?.seat_or_berth ?? ""}
                        placeholder={`Enter ${labels.seat.toLowerCase()} from the ticket`}
                      />
                    </label>
                  )}
                  {fields.coach && (
                    <label className="form-label text-xs">
                      {labels.coach}
                      <input
                        className="form-input"
                        name="coachOrCabin"
                        defaultValue={row?.coach_or_cabin ?? ""}
                        placeholder={`Enter ${labels.coach.toLowerCase()}, if provided`}
                      />
                    </label>
                  )}
                  <label className="form-label text-xs">
                    {labels.reference}
                    <input
                      className="form-input"
                      name="passengerReference"
                      defaultValue={row?.passenger_reference ?? ""}
                      placeholder="Enter this traveler's reference, if provided"
                    />
                  </label>
                  <button
                    className="secondary-button self-end"
                    disabled={mutation.isPending}
                    aria-label={`Save ${leg.mode} details for ${traveler.display_name}`}
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
          );
        })}
      </div>
      {(message || mutation.error) && (
        <p
          role="status"
          className={`mt-3 text-sm font-bold ${mutation.error ? "text-danger" : "text-success"}`}
        >
          {mutation.error ? getErrorMessage(mutation.error) : message}
        </p>
      )}
    </section>
  );
}

export function JourneyTravelerDetails({
  tripId,
  legs,
  travelers,
  canEdit = false
}: {
  tripId: string;
  legs: JourneyLeg[];
  travelers: Traveler[];
  canEdit?: boolean;
}) {
  const passengerDetailLegs = legs.filter((leg) => leg.mode !== "cab");
  if (!passengerDetailLegs.length || !travelers.length) return null;
  return (
    <section className="rounded-xl border border-line bg-surface p-3">
      <p className="flex items-center gap-2 font-display text-base font-black">
        <UsersRound className="size-5 text-brand" /> Traveler journey details
      </p>

      <div className="mt-3 space-y-2">
        {passengerDetailLegs.map((leg) => (
          <JourneyTravelerLegDetails
            key={leg.id}
            tripId={tripId}
            leg={leg}
            travelers={travelers}
            canEdit={canEdit}
            index={legs.indexOf(leg)}
            count={legs.length}
          />
        ))}
      </div>
    </section>
  );
}
