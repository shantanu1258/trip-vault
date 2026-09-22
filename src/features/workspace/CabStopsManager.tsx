import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { formatEventTime, formatMoney, getErrorMessage } from "../trips/presentation";
import type { TripCost } from "../trips/types";
import {
  amountStringToMinor,
  isValidTimeZone,
  isoToLocalDateTime,
  localDateTimeToIso
} from "../trips/validation";
import {
  addCabStop,
  archiveCabStop,
  listCabStopsForTrip,
  reorderCabStops,
  saveOptionalCostForCreatedEvent,
  updateCabStop
} from "./api";
import type { CabStop, JourneyLeg } from "./types";

type Draft = {
  id?: string;
  title: string;
  location: string;
  mapUrl: string;
  arrivesLocal: string;
  departsLocal: string;
  notes: string;
  costAmount: string;
  paymentStatus: "planned" | "paid";
};

function emptyDraft(): Draft {
  return {
    title: "",
    location: "",
    mapUrl: "",
    arrivesLocal: "",
    departsLocal: "",
    notes: "",
    costAmount: "",
    paymentStatus: "planned"
  };
}

function draftFor(stop: CabStop, eventTimezone: string): Draft {
  return {
    id: stop.id,
    title: stop.title,
    location: stop.location?.label ?? stop.location?.address ?? "",
    mapUrl: stop.location?.map_url ?? "",
    arrivesLocal: isoToLocalDateTime(stop.arrives_at, eventTimezone),
    departsLocal: isoToLocalDateTime(stop.departs_at, eventTimezone),
    notes: stop.notes ?? "",
    costAmount: "",
    paymentStatus: "planned"
  };
}

function secureUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("The stop map link must be a complete web address.");
  }
  if (parsed.protocol !== "https:") throw new Error("The stop map link must start with https://.");
  return parsed.toString();
}

export function CabStopsManager({
  tripId,
  leg,
  costs,
  currencyCode,
  eventTimezone,
  participantTravelerIds,
  editable
}: {
  tripId: string;
  leg: JourneyLeg;
  costs: TripCost[];
  currencyCode: string;
  eventTimezone: string;
  participantTravelerIds: string[];
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stopsQuery = useQuery({
    queryKey: ["cab-stops", tripId, leg.id],
    queryFn: () => listCabStopsForTrip(tripId, [leg.id])
  });
  const stops = stopsQuery.data ?? [];

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cab-stops", tripId] }),
      queryClient.invalidateQueries({ queryKey: ["costs", tripId] })
    ]);
  };
  const save = useMutation({
    mutationFn: async (next: Draft) => {
      if (!next.title.trim()) throw new Error("Name this cab stop.");
      if (!isValidTimeZone(eventTimezone)) throw new Error("Choose a valid cab event time zone.");
      const arrivesAt = next.arrivesLocal
        ? localDateTimeToIso(next.arrivesLocal, eventTimezone)
        : undefined;
      const departsAt = next.departsLocal
        ? localDateTimeToIso(next.departsLocal, eventTimezone)
        : undefined;
      if (arrivesAt && departsAt && departsAt < arrivesAt)
        throw new Error("A cab stop cannot depart before it arrives.");
      const mapUrl = secureUrl(next.mapUrl);
      const common = {
        tripId,
        journeyLegId: leg.id,
        title: next.title,
        location: next.location,
        mapUrl,
        arrivesAt,
        departsAt,
        timezone: eventTimezone,
        notes: next.notes
      };
      const stop = next.id
        ? await updateCabStop({
            ...common,
            id: next.id,
            version: stops.find((candidate) => candidate.id === next.id)?.version
          })
        : await addCabStop(common);
      let costWarning: string | undefined;
      if (next.costAmount.trim()) {
        if (next.id && costs.some((cost) => cost.cab_stop_id === next.id))
          throw new Error("This stop already has a cost. Edit it from Trip expenses.");
        if (!/^\d+(?:\.\d+)?$/.test(next.costAmount) || Number(next.costAmount) <= 0)
          throw new Error("Enter a stop cost greater than zero.");
        costWarning = await saveOptionalCostForCreatedEvent({
          tripId,
          bookingId: leg.booking_id,
          cabStopId: stop.id,
          title: `${next.title.trim()} cost`,
          category: "transport",
          amountMinor: amountStringToMinor(next.costAmount, currencyCode),
          currencyCode,
          paymentStatus: next.paymentStatus,
          participantTravelerIds
        });
      }
      return { stop, costWarning };
    },
    onSuccess: async ({ costWarning }) => {
      setDraft(null);
      setNotice(costWarning ?? null);
      await refresh();
    }
  });
  const move = useMutation({
    mutationFn: ({ stopId, direction }: { stopId: string; direction: "up" | "down" }) =>
      reorderCabStops(tripId, stops, stopId, direction),
    onSuccess: async (rows) => {
      queryClient.setQueryData(["cab-stops", tripId, leg.id], rows);
      await queryClient.invalidateQueries({ queryKey: ["cab-stops", tripId] });
    }
  });
  const archive = useMutation({
    mutationFn: (stop: CabStop) => archiveCabStop(stop, tripId),
    onSuccess: refresh
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft) save.mutate(draft);
  };
  const error = save.error ?? move.error ?? archive.error ?? stopsQuery.error;
  const draftCosts = draft?.id ? costs.filter((cost) => cost.cab_stop_id === draft.id) : [];

  return (
    <section
      aria-label="Journey stops"
      className="mt-3 rounded-xl border border-line bg-surface/70 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold">Journey stops</p>
          {draft && (
            <p className="mt-1 text-xs leading-5 text-muted">
              Keep the whole-day cab together and add its intermediate stops here.
            </p>
          )}
        </div>
        {editable && !draft && (
          <button
            type="button"
            className="secondary-button min-h-9 px-3 py-2 text-xs"
            onClick={() => setDraft(emptyDraft())}
          >
            <Plus className="size-3.5" /> Add stop
          </button>
        )}
      </div>

      {stopsQuery.isPending ? (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading stops…
        </p>
      ) : stops.length ? (
        <ol className="mt-3 space-y-2">
          {stops.map((stop, index) => {
            const stopCosts = costs.filter((cost) => cost.cab_stop_id === stop.id);
            const editing = draft?.id === stop.id;
            return (
              <li
                key={stop.id}
                aria-label={`Cab stop ${index + 1}: ${stop.title}`}
                aria-current={editing ? "true" : undefined}
                className={`rounded-xl border p-2.5 transition ${editing ? "border-brand bg-brand-soft/40 shadow-soft" : "border-transparent bg-elevated"}`}
              >
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[.65rem] font-black text-brand">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-extrabold">{stop.title}</p>
                    {stop.location?.label && (
                      <p className="mt-1 flex min-w-0 items-start gap-1 break-words text-xs text-muted">
                        <MapPin className="mt-0.5 size-3 shrink-0" /> {stop.location.label}
                      </p>
                    )}
                    {(stop.arrives_at || stop.departs_at) && (
                      <p className="mt-1 text-xs text-muted">
                        {stop.arrives_at
                          ? `Arrive ${formatEventTime(stop.arrives_at, eventTimezone)}`
                          : ""}
                        {stop.arrives_at && stop.departs_at ? " · " : ""}
                        {stop.departs_at
                          ? `Leave ${formatEventTime(stop.departs_at, eventTimezone)}`
                          : ""}
                      </p>
                    )}
                    {stopCosts.length > 0 && (
                      <p className="mt-1 text-xs font-bold text-brand">
                        {stopCosts
                          .map((cost) => formatMoney(cost.amount_minor, cost.currency_code))
                          .join(" + ")}
                      </p>
                    )}
                    {stop.notes && (
                      <p className="mt-1 break-words text-xs text-muted">{stop.notes}</p>
                    )}
                  </div>
                  {(stop.location?.map_url || editable) && (
                    <div
                      className="flex shrink-0 flex-col items-end gap-0.5"
                      aria-label={`Actions for ${stop.title}`}
                    >
                      {stop.location?.map_url && (
                        <a
                          href={stop.location.map_url}
                          target="_blank"
                          rel="noreferrer"
                          className="grid size-8 place-items-center rounded-lg text-brand"
                          aria-label={`Open map for ${stop.title}`}
                        >
                          <ExternalLink className="size-3.5" />
                        </a>
                      )}
                      {editable && (
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25"
                            disabled={index === 0 || move.isPending}
                            onClick={() => move.mutate({ stopId: stop.id, direction: "up" })}
                            aria-label={`Move ${stop.title} earlier`}
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25"
                            disabled={index === stops.length - 1 || move.isPending}
                            onClick={() => move.mutate({ stopId: stop.id, direction: "down" })}
                            aria-label={`Move ${stop.title} later`}
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg text-muted"
                            onClick={() => setDraft(draftFor(stop, eventTimezone))}
                            aria-label={`Edit ${stop.title}`}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg text-danger"
                            disabled={archive.isPending}
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: "Remove cab stop?",
                                  message: `Remove ${stop.title} from this cab journey? Recorded costs remain in Trip expenses.`,
                                  confirmLabel: "Remove",
                                  tone: "danger"
                                })
                              )
                                archive.mutate(stop);
                            }}
                            aria-label={`Remove ${stop.title}`}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 rounded-xl bg-elevated p-3 text-xs text-muted">
          No intermediate stops yet. Pickup and final drop-off remain on the cab booking.
        </p>
      )}

      {draft && (
        <form
          className="mt-4 space-y-3 rounded-2xl border border-brand/40 bg-brand-soft/20 p-4 shadow-soft"
          aria-label={draft.id ? "Edit cab stop" : "Add cab stop"}
          onSubmit={submit}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-brand">Journey stop</p>
              <h3 className="mt-1 font-display text-xl font-black">
                {draft.id ? "Edit stop" : "Add stop"}
              </h3>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-muted"
              onClick={() => setDraft(null)}
              aria-label="Cancel editing stop"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-label">
              Stop name <span aria-hidden="true">*</span>
              <input
                className="form-input"
                required
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Lunch, attraction, hotel…"
              />
            </label>
            {draftCosts.length ? (
              <div className="rounded-xl bg-surface/70 px-3 py-2">
                <p className="text-xs font-bold text-muted">Cost</p>
                <p className="mt-1 font-display text-lg font-black text-brand">
                  {draftCosts
                    .map((cost) => formatMoney(cost.amount_minor, cost.currency_code))
                    .join(" + ")}
                </p>
                <p className="mt-1 text-[.7rem] leading-4 text-muted">
                  Edit this from Trip expenses.
                </p>
              </div>
            ) : (
              <label className="form-label">
                Extra cost (optional)
                <div className="form-input flex items-center gap-2">
                  <span className="text-xs font-bold text-muted">{currencyCode}</span>
                  <input
                    className="min-w-0 flex-1 bg-transparent outline-none"
                    inputMode="decimal"
                    aria-label="Extra cost (optional)"
                    value={draft.costAmount}
                    onChange={(event) => setDraft({ ...draft, costAmount: event.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </label>
            )}
          </div>
          <details className="group !p-0 rounded-lg border border-line/70 bg-surface/60">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 text-xs font-bold text-brand marker:hidden">
              More details
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2">
              <label className="form-label">
                Place
                <input
                  className="form-input"
                  value={draft.location}
                  onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                  placeholder="Address or pickup point"
                />
              </label>
              {!draftCosts.length && (
                <label className="form-label">
                  Payment
                  <select
                    className="form-input"
                    value={draft.paymentStatus}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        paymentStatus: event.target.value as "planned" | "paid"
                      })
                    }
                  >
                    <option value="planned">Planned / unpaid</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
              )}
              <label className="form-label">
                Arrive (optional)
                <input
                  className="form-input"
                  type="datetime-local"
                  value={draft.arrivesLocal}
                  onChange={(event) => setDraft({ ...draft, arrivesLocal: event.target.value })}
                />
              </label>
              <label className="form-label">
                Leave (optional)
                <input
                  className="form-input"
                  type="datetime-local"
                  value={draft.departsLocal}
                  onChange={(event) => setDraft({ ...draft, departsLocal: event.target.value })}
                />
              </label>
              <label className="form-label sm:col-span-2">
                Google Maps link (optional)
                <input
                  className="form-input"
                  type="url"
                  value={draft.mapUrl}
                  onChange={(event) => setDraft({ ...draft, mapUrl: event.target.value })}
                  placeholder="https://maps.google.com/…"
                />
              </label>
              <label className="form-label sm:col-span-2">
                Notes (optional)
                <textarea
                  className="form-input min-h-20"
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </label>
            </div>
          </details>
          {save.error && (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
              {getErrorMessage(save.error)}
            </p>
          )}
          <button type="submit" className="primary-button w-full" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {draft.id ? "Save stop" : "Add stop"}
          </button>
        </form>
      )}
      {error && !save.error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
          {getErrorMessage(error)}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs font-bold text-ink"
        >
          The stop is saved. {notice}
        </p>
      )}
    </section>
  );
}
