import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { addTripCost } from "../trips/api";
import { formatEventTime, formatMoney, getErrorMessage } from "../trips/presentation";
import type { ItineraryItem, TripCost } from "../trips/types";
import {
  amountStringToMinor,
  isValidTimeZone,
  isoToLocalDateTime,
  localDateTimeToIso
} from "../trips/validation";
import {
  addActivityMoment,
  archiveActivityMoment,
  listActivityMoments,
  reorderActivityMoments,
  updateActivityMoment
} from "./api";
import type { ActivityMoment } from "./types";

type Draft = {
  id?: string;
  version?: number;
  title: string;
  location: string;
  mapUrl: string;
  startsLocal: string;
  endsLocal: string;
  notes: string;
  costAmount: string;
  paymentStatus: "planned" | "paid";
};

function emptyDraft(): Draft {
  return {
    title: "",
    location: "",
    mapUrl: "",
    startsLocal: "",
    endsLocal: "",
    notes: "",
    costAmount: "",
    paymentStatus: "planned"
  };
}

function draftFor(moment: ActivityMoment): Draft {
  return {
    id: moment.id,
    version: moment.version,
    title: moment.title,
    location: moment.location?.label ?? moment.location?.address ?? "",
    mapUrl: moment.location?.map_url ?? "",
    startsLocal: isoToLocalDateTime(moment.starts_at, moment.timezone),
    endsLocal: isoToLocalDateTime(moment.ends_at, moment.timezone),
    notes: moment.notes ?? "",
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
    throw new Error("The Moment map link must be a complete web address.");
  }
  if (parsed.protocol !== "https:")
    throw new Error("The Moment map link must start with https://.");
  return parsed.toString();
}

export function ActivityMomentsManager({
  tripId,
  item,
  costs,
  currencyCode,
  participantTravelerIds,
  editable
}: {
  tripId: string;
  item: ItineraryItem;
  costs: TripCost[];
  currencyCode: string;
  participantTravelerIds: string[];
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState("");
  const queryKey = ["activity-moments", item.id] as const;
  const momentsQuery = useQuery({
    queryKey,
    queryFn: () => listActivityMoments(item.id)
  });
  const moments = momentsQuery.data ?? [];

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["activity-moments", tripId] }),
      queryClient.invalidateQueries({ queryKey: ["costs", tripId] })
    ]);
  };
  const save = useMutation({
    mutationFn: async (next: Draft) => {
      if (!next.title.trim()) throw new Error("Name this Moment.");
      if (!isValidTimeZone(item.timezone)) throw new Error("Choose a valid activity time zone.");
      const startsAt = next.startsLocal
        ? localDateTimeToIso(next.startsLocal, item.timezone)
        : undefined;
      const endsAt = next.endsLocal ? localDateTimeToIso(next.endsLocal, item.timezone) : undefined;
      if (startsAt && endsAt && endsAt < startsAt)
        throw new Error("A Moment cannot end before it starts.");
      const common = {
        tripId,
        itineraryItemId: item.id,
        title: next.title,
        location: next.location,
        mapUrl: secureUrl(next.mapUrl),
        startsAt,
        endsAt,
        timezone: item.timezone,
        notes: next.notes
      };
      const moment = next.id
        ? await updateActivityMoment({ ...common, id: next.id, version: next.version })
        : await addActivityMoment(common);
      let costWarning = "";
      if (next.costAmount.trim()) {
        if (next.id && costs.some((cost) => cost.activity_moment_id === next.id))
          throw new Error("This Moment already has a cost. Edit it from Trip expenses.");
        if (!/^\d+(?:\.\d+)?$/.test(next.costAmount) || Number(next.costAmount) <= 0)
          throw new Error("Enter a Moment cost greater than zero.");
        try {
          await addTripCost({
            tripId,
            itineraryItemId: item.id,
            activityMomentId: moment.id,
            title: `${next.title.trim()} cost`,
            category: "activity",
            amountMinor: amountStringToMinor(next.costAmount, currencyCode),
            currencyCode,
            paymentStatus: next.paymentStatus,
            participantTravelerIds
          });
        } catch {
          costWarning = "Moment saved, but its cost still needs to be added from Trip expenses.";
        }
      }
      return costWarning;
    },
    onSuccess: async (costWarning) => {
      setDraft(null);
      setNotice(costWarning || "Moment saved.");
      await refresh();
    }
  });
  const move = useMutation({
    mutationFn: ({ momentId, direction }: { momentId: string; direction: "up" | "down" }) =>
      reorderActivityMoments(moments, momentId, direction),
    onSuccess: async (rows) => {
      queryClient.setQueryData(queryKey, rows);
      await queryClient.invalidateQueries({ queryKey });
    }
  });
  const archive = useMutation({
    mutationFn: archiveActivityMoment,
    onSuccess: refresh
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft) save.mutate(draft);
  };
  const error = momentsQuery.error ?? save.error ?? move.error ?? archive.error;
  const busy = save.isPending || move.isPending || archive.isPending;

  return (
    <section
      aria-label="Activity moments"
      className="mt-3 rounded-xl border border-line bg-surface/70 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-extrabold">
            <Sparkles className="size-4 text-brand" /> Moments
          </p>
          {draft && (
            <p className="mt-1 text-xs leading-5 text-muted">
              Add the small adventures, meals, and places that make up this activity.
            </p>
          )}
        </div>
        {editable && !draft && (
          <button
            type="button"
            className="secondary-button min-h-9 px-3 py-2 text-xs"
            onClick={() => setDraft(emptyDraft())}
          >
            <Plus className="size-3.5" /> Add Moment
          </button>
        )}
      </div>

      {momentsQuery.isPending ? (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading Moments…
        </p>
      ) : moments.length ? (
        <ol className="mt-3 space-y-2">
          {moments.map((moment, index) => {
            const momentCosts = costs.filter((cost) => cost.activity_moment_id === moment.id);
            const editing = draft?.id === moment.id;
            return (
              <li
                key={moment.id}
                aria-label={`Moment ${index + 1}: ${moment.title}`}
                aria-current={editing ? "true" : undefined}
                className={`rounded-xl border px-2.5 py-2 transition ${editing ? "border-brand bg-brand-soft/40 shadow-soft" : "border-transparent bg-elevated"}`}
              >
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[.65rem] font-black text-brand">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-extrabold">{moment.title}</p>
                    <p className="mt-0.5 flex min-w-0 items-center gap-2 truncate text-xs text-muted">
                      {moment.location?.label && (
                        <span className="inline-flex min-w-0 items-center gap-1 truncate">
                          <MapPin className="size-3 shrink-0" />
                          <span className="truncate">{moment.location.label}</span>
                        </span>
                      )}
                      {moment.starts_at && (
                        <span className="shrink-0">
                          {formatEventTime(moment.starts_at, moment.timezone)}
                        </span>
                      )}
                      {momentCosts.length > 0 && (
                        <strong className="shrink-0 text-brand">
                          {momentCosts
                            .map((cost) => formatMoney(cost.amount_minor, cost.currency_code))
                            .join(" + ")}
                        </strong>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {moment.location?.map_url && (
                      <a
                        href={moment.location.map_url}
                        target="_blank"
                        rel="noreferrer"
                        className="grid size-8 place-items-center rounded-lg text-brand"
                        aria-label={`Open map for ${moment.title}`}
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                    {editable && (
                      <>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25"
                          disabled={index === 0 || busy}
                          onClick={() => move.mutate({ momentId: moment.id, direction: "up" })}
                          aria-label={`Move ${moment.title} earlier`}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25"
                          disabled={index === moments.length - 1 || busy}
                          onClick={() => move.mutate({ momentId: moment.id, direction: "down" })}
                          aria-label={`Move ${moment.title} later`}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted"
                          disabled={busy}
                          onClick={() => setDraft(draftFor(moment))}
                          aria-label={`Edit ${moment.title}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-danger"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Remove Moment?",
                                message: `Remove ${moment.title} from this activity? Recorded costs remain in Trip expenses.`,
                                confirmLabel: "Remove",
                                tone: "danger"
                              })
                            )
                              archive.mutate(moment);
                          }}
                          aria-label={`Remove ${moment.title}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 rounded-xl bg-elevated p-3 text-xs text-muted">
          No Moments yet. Add the smaller experiences that make up this activity.
        </p>
      )}

      {draft && (
        <form
          aria-label={draft.id ? "Edit activity Moment" : "Add activity Moment"}
          className="mt-4 space-y-4 rounded-2xl border border-brand/40 bg-brand-soft/20 p-4 shadow-soft"
          onSubmit={submit}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow text-brand">Activity Moment</p>
              <h3 className="mt-1 font-display text-xl font-black">
                {draft.id ? "Edit Moment" : "Add Moment"}
              </h3>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-muted"
              onClick={() => setDraft(null)}
              aria-label="Cancel editing Moment"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="form-label">
              Moment name <span aria-hidden="true">*</span>
              <input
                className="form-input"
                required
                value={draft.title}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                placeholder="Gallery, lunch, sunset…"
              />
            </label>
            <label className="form-label">
              Place
              <input
                className="form-input"
                value={draft.location}
                onChange={(event) => setDraft({ ...draft, location: event.target.value })}
                placeholder="Name or address"
              />
            </label>
            <label className="form-label">
              Starts (optional)
              <input
                className="form-input"
                type="datetime-local"
                value={draft.startsLocal}
                onChange={(event) => setDraft({ ...draft, startsLocal: event.target.value })}
              />
            </label>
            <label className="form-label">
              Ends (optional)
              <input
                className="form-input"
                type="datetime-local"
                value={draft.endsLocal}
                onChange={(event) => setDraft({ ...draft, endsLocal: event.target.value })}
              />
            </label>
            <label className="form-label sm:col-span-2">
              Map link (optional)
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
            {!draft.id || !costs.some((cost) => cost.activity_moment_id === draft.id) ? (
              <>
                <label className="form-label">
                  Cost (optional)
                  <div className="form-input flex items-center gap-2">
                    <span className="text-xs font-bold text-muted">{currencyCode}</span>
                    <input
                      className="min-w-0 flex-1 bg-transparent outline-none"
                      inputMode="decimal"
                      aria-label="Moment cost (optional)"
                      value={draft.costAmount}
                      onChange={(event) => setDraft({ ...draft, costAmount: event.target.value })}
                      placeholder="0.00"
                    />
                  </div>
                </label>
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
              </>
            ) : (
              <p className="sm:col-span-2 text-xs text-muted">
                This Moment already has a cost. Edit it from Trip expenses.
              </p>
            )}
          </div>
          {save.error && (
            <p role="alert" className="rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
              {getErrorMessage(save.error)}
            </p>
          )}
          <button type="submit" className="primary-button w-full" disabled={save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {draft.id ? "Save Moment" : "Add Moment"}
          </button>
        </form>
      )}

      {notice && (
        <p
          role="status"
          className="mt-3 rounded-xl bg-success/10 p-3 text-xs font-bold text-success"
        >
          {notice}
        </p>
      )}
      {error && !save.error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
          {getErrorMessage(error)}
        </p>
      )}
    </section>
  );
}
