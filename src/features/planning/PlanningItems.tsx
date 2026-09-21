import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus2,
  CarTaxiFront,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  ExternalLink,
  Link2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Unlink,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { EventSilhouette } from "../../components/EventSilhouette";
import { EventTypeIcon } from "../../components/EventTypeIcon";
import { ModalSheet } from "../../components/ModalSheet";
import { TripChildLink } from "../../components/TripChildLink";
import { preferredScrollBehavior } from "../timeline/scroll";
import { formatEventTime, getErrorMessage } from "../trips/presentation";
import type { ItineraryItem } from "../trips/types";
import { isoToLocalDateTime, localDateTimeToIso } from "../trips/validation";
import {
  addPlanningItem,
  archivePlanningItem,
  createActivityFromPlanning,
  createCabRouteFromPlanning,
  listPlanningItems,
  promotePlanningItem,
  reorderPlanningItems,
  unlinkPlanningItem,
  updatePlanningItem
} from "./api";
import type {
  PlanningItem,
  PlanningItemKind,
  PlanningPromotionContext,
  PlanningPromotionType
} from "./types";

const kindLabels: Record<PlanningItemKind, string> = {
  place: "Place",
  meal: "Meal",
  activity: "Activity",
  transport: "Other transport",
  free_time: "Free time",
  note: "Note"
};

const promotionLabels: Record<PlanningPromotionType, string> = {
  activity: "Activity",
  meal: "Meal",
  transport: "Other transport",
  custom: "Other event"
};

type PlanningDraft = {
  id?: string;
  version?: number;
  kind: PlanningItemKind;
  title: string;
  startsLocal: string;
  durationMinutes: string;
  location: string;
  mapUrl: string;
  notes: string;
};

type PendingConversion =
  | { kind: "event"; item: PlanningItem; eventType: PlanningPromotionType }
  | { kind: "activity"; items: PlanningItem[] }
  | { kind: "cab"; items: PlanningItem[] };

function emptyDraft(): PlanningDraft {
  return {
    kind: "place",
    title: "",
    startsLocal: "",
    durationMinutes: "",
    location: "",
    mapUrl: "",
    notes: ""
  };
}

function draftFor(item: PlanningItem): PlanningDraft {
  return {
    id: item.id,
    version: item.version,
    kind: item.kind,
    title: item.title,
    startsLocal: isoToLocalDateTime(item.starts_at, item.timezone),
    durationMinutes: item.duration_minutes ? String(item.duration_minutes) : "",
    location: item.location?.label ?? item.location?.address ?? "",
    mapUrl: item.location?.map_url ?? "",
    notes: item.notes ?? ""
  };
}

function preferredPromotion(kind: PlanningItemKind): PlanningPromotionType {
  if (kind === "meal") return "meal";
  if (kind === "transport") return "transport";
  if (kind === "note" || kind === "free_time") return "custom";
  return "activity";
}

function secureMapUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("The map link must be a complete web address.");
  }
  if (parsed.protocol !== "https:") throw new Error("The map link must start with https://.");
  return parsed.toString();
}

function itemTimeLabel(item: PlanningItem) {
  if (!item.starts_at) return "Flexible time";
  const duration = item.duration_minutes ? ` · ${item.duration_minutes} min` : "";
  return `${formatEventTime(item.starts_at, item.timezone)}${duration}`;
}

function linkedPresentation(item: PlanningItem, itinerary: ItineraryItem[]) {
  const linked = itinerary.find((event) => event.id === item.linked_itinerary_item_id);
  return linked
    ? {
        title: linked.title,
        location: linked.location?.label,
        time: formatEventTime(linked.starts_at, linked.timezone),
        event: linked
      }
    : {
        title: item.title,
        location: item.location?.label,
        time: itemTimeLabel(item),
        event: undefined
      };
}

function itemDetailsHref(detailsHref: string, itemId: string) {
  return `${detailsHref}${detailsHref.includes("?") ? "&" : "?"}item=${encodeURIComponent(itemId)}`;
}

export function PlanningItemsSummary({
  planningEventId,
  itinerary,
  tripId,
  detailsHref,
  navigationState
}: {
  planningEventId: string;
  itinerary: ItineraryItem[];
  tripId?: string;
  detailsHref?: string;
  navigationState?: unknown;
}) {
  const query = useQuery({
    queryKey: ["planning-items", planningEventId],
    queryFn: () => listPlanningItems(planningEventId)
  });
  const items = query.data ?? [];
  if (!items.length && !detailsHref) return null;

  return (
    <section
      aria-label="Day plan"
      className="event-modal-scene event-type-icon--preparation relative isolate mt-3 overflow-hidden rounded-xl bg-elevated/80 px-3 py-2.5 pr-14"
    >
      <EventSilhouette type="preparation" placement="summary" />
      {tripId && detailsHref && (
        <TripChildLink
          tripId={tripId}
          scrollAnchorId={`timeline-${planningEventId}`}
          to={detailsHref}
          state={navigationState}
          aria-label="Open plan details"
          className="absolute inset-0 z-20 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        />
      )}
      <div className="relative z-[1]">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[.12em] text-muted">Day plan</p>
          <span className="inline-flex items-center gap-1 text-xs font-bold text-muted">
            {items.length} item{items.length === 1 ? "" : "s"}
            {detailsHref && <ChevronRight className="size-3.5" />}
          </span>
        </div>
        {items.length ? (
          <ol className="mt-1.5 space-y-1" aria-label="Planned stops">
            {items.slice(0, 3).map((item, index) => {
              const presented = linkedPresentation(item, itinerary);
              const time = presented.event
                ? presented.time
                : item.starts_at
                  ? itemTimeLabel(item)
                  : null;
              return (
                <li key={item.id} className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
                  <MapPin className="size-3 shrink-0 text-brand" />
                  <strong className="min-w-0 truncate text-ink">
                    {index + 1}. {presented.title}
                  </strong>
                  {time && <span className="shrink-0">· {time}</span>}
                  {item.linked_itinerary_item_id && (
                    <Link2 aria-label="Linked event" className="size-3 shrink-0 text-brand" />
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-muted">Open the plan to add the first place or idea.</p>
        )}
        {items.length > 3 && (
          <p className="mt-1 text-xs font-bold text-brand">
            +{items.length - 3} more planned stops
          </p>
        )}
      </div>
    </section>
  );
}

export function PlanningItemsCompactEditor({
  planningEvent,
  itinerary,
  tripId,
  detailsHref,
  navigationState,
  editable,
  onOpenEvent
}: {
  planningEvent: ItineraryItem;
  itinerary: ItineraryItem[];
  tripId: string;
  detailsHref: string;
  navigationState?: unknown;
  editable: boolean;
  onOpenEvent?: (eventId: string) => void;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<PlanningItemKind>("place");
  const [highlightedId, setHighlightedId] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const queryKey = ["planning-items", planningEvent.id] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => listPlanningItems(planningEvent.id)
  });
  const items = query.data ?? [];

  useEffect(() => {
    if (!adding) return;
    const frame = window.requestAnimationFrame(() =>
      nameInputRef.current?.focus({ preventScroll: true })
    );
    return () => window.cancelAnimationFrame(frame);
  }, [adding]);

  useEffect(() => {
    if (!highlightedId) return;
    const timeout = window.setTimeout(() => setHighlightedId(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [highlightedId]);

  const refresh = () => queryClient.invalidateQueries({ queryKey });
  const add = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new Error("Name this planning item.");
      return addPlanningItem({
        planningEventId: planningEvent.id,
        kind,
        title,
        timezone: planningEvent.timezone
      });
    },
    onSuccess: async (item) => {
      setTitle("");
      setKind("place");
      setAdding(false);
      setHighlightedId(item.id);
      await refresh();
    }
  });
  const move = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) =>
      reorderPlanningItems(items, itemId, direction),
    onSuccess: async (rows) => {
      queryClient.setQueryData(queryKey, rows);
      await refresh();
    }
  });
  const archive = useMutation({
    mutationFn: archivePlanningItem,
    onSuccess: refresh
  });
  const error = query.error ?? add.error ?? move.error ?? archive.error;
  const busy = add.isPending || move.isPending || archive.isPending;

  return (
    <section
      aria-label="Day plan quick controls"
      className="event-modal-scene event-type-icon--preparation relative isolate mt-3 overflow-hidden rounded-xl border border-line bg-elevated/80 p-3"
    >
      <EventSilhouette type="preparation" placement="summary" />
      <div className="relative z-[1]">
        <div className="flex items-center justify-between gap-3">
          <TripChildLink
            tripId={tripId}
            scrollAnchorId={`timeline-${planningEvent.id}`}
            to={detailsHref}
            state={navigationState}
            className="min-w-0 rounded-lg pr-2"
            aria-label="Open full Plan details"
          >
            <p className="text-xs font-black uppercase tracking-[.12em] text-muted">Day plan</p>
            <p className="mt-0.5 text-xs text-muted">
              {items.length} item{items.length === 1 ? "" : "s"}
            </p>
          </TripChildLink>
          {editable && !adding && (
            <button
              type="button"
              className="secondary-button min-h-9 px-3 py-2 text-xs"
              onClick={() => setAdding(true)}
            >
              <Plus className="size-3.5" /> Add item
            </button>
          )}
        </div>

        {adding && (
          <form
            aria-label="Quick add plan item"
            className="plan-form-enter mt-3 origin-top rounded-xl border border-brand/35 bg-surface/90 p-3 shadow-soft"
            onSubmit={(event) => {
              event.preventDefault();
              add.mutate();
            }}
          >
            <div className="grid gap-2 sm:grid-cols-[minmax(7rem,.7fr)_minmax(0,1.3fr)]">
              <label className="form-label">
                Type
                <select
                  className="form-input"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as PlanningItemKind)}
                >
                  {Object.entries(kindLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-label">
                Name
                <input
                  ref={nameInputRef}
                  required
                  className="form-input"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Lunch, museum, beach…"
                />
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button type="submit" className="primary-button flex-1" disabled={add.isPending}>
                {add.isPending && <Loader2 className="size-4 animate-spin" />}
                Add to plan
              </button>
              <button
                type="button"
                className="secondary-button"
                disabled={add.isPending}
                onClick={() => {
                  setAdding(false);
                  setTitle("");
                  setKind("place");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {query.isPending ? (
          <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
            <Loader2 className="size-3.5 animate-spin" /> Loading the day plan…
          </p>
        ) : items.length ? (
          <ol className="mt-3 space-y-1.5" aria-label="Plan sequence">
            {items.map((item, index) => {
              const linked = linkedPresentation(item, itinerary);
              return (
                <li
                  key={item.id}
                  aria-label={`Plan item ${index + 1}: ${linked.title}`}
                  className={`grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 rounded-xl border bg-surface/80 px-2 py-1.5 ${highlightedId === item.id ? "plan-item-added border-brand" : "border-brand/25"}`}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-black text-brand">
                    {index + 1}
                  </span>
                  <TripChildLink
                    tripId={tripId}
                    scrollAnchorId={`timeline-${planningEvent.id}`}
                    to={itemDetailsHref(detailsHref, item.id)}
                    state={navigationState}
                    className="flex min-h-10 min-w-0 items-center gap-1.5 rounded-lg px-1 text-left"
                    aria-label={`Open plan details for ${linked.title}`}
                  >
                    <strong className="min-w-0 truncate text-sm">{linked.title}</strong>
                  </TripChildLink>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {item.linked_itinerary_item_id && (
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-lg text-brand"
                        onClick={() => onOpenEvent?.(item.linked_itinerary_item_id!)}
                        aria-label={`Open linked event ${linked.title}`}
                      >
                        <Link2 className="size-3.5" />
                      </button>
                    )}
                    {editable && (
                      <>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25"
                          disabled={index === 0 || busy}
                          onClick={() => move.mutate({ itemId: item.id, direction: "up" })}
                          aria-label={`Move ${item.title} earlier`}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25"
                          disabled={index === items.length - 1 || busy}
                          onClick={() => move.mutate({ itemId: item.id, direction: "down" })}
                          aria-label={`Move ${item.title} later`}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-danger"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Remove planning item?",
                                message: `Remove ${item.title} from this plan? Any linked event remains.`,
                                confirmLabel: "Remove",
                                tone: "danger"
                              })
                            )
                              archive.mutate(item);
                          }}
                          aria-label={`Remove ${item.title}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="mt-3 rounded-xl bg-surface/80 p-3 text-xs text-muted">
            Add the first place or idea here, then fill in the details on the full Plan page.
          </p>
        )}

        <TripChildLink
          tripId={tripId}
          scrollAnchorId={`timeline-${planningEvent.id}`}
          to={detailsHref}
          state={navigationState}
          className="secondary-button mt-3 w-full"
        >
          Open full Plan details <ChevronRight className="size-4" />
        </TripChildLink>
        {highlightedId && (
          <p role="status" className="sr-only">
            Item added to the plan and highlighted.
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="mt-3 rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger"
          >
            {getErrorMessage(error)}
          </p>
        )}
      </div>
    </section>
  );
}

function PlanningItemForm({
  draft,
  setDraft,
  advancedOpen,
  setAdvancedOpen,
  formRef,
  nameInputRef,
  saving,
  onSubmit,
  onCancel
}: {
  draft: PlanningDraft;
  setDraft: (draft: PlanningDraft) => void;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  formRef: RefObject<HTMLFormElement>;
  nameInputRef: RefObject<HTMLInputElement>;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      aria-label={draft.id ? `Edit ${draft.title}` : "Add plan item"}
      className="plan-form-enter mt-3 origin-top scroll-mt-24 space-y-4 rounded-2xl border border-brand/40 bg-brand-soft/20 p-4 shadow-soft"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-black">{draft.id ? "Edit plan item" : "Add to the plan"}</p>
        <button
          type="button"
          className="grid size-9 place-items-center rounded-xl text-muted"
          onClick={onCancel}
          aria-label="Close planning item form"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="form-label">
          Type
          <select
            value={draft.kind}
            onChange={(event) =>
              setDraft({ ...draft, kind: event.target.value as PlanningItemKind })
            }
            className="form-input"
          >
            {Object.entries(kindLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-label">
          Name
          <input
            ref={nameInputRef}
            required
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            className="form-input"
            placeholder="Lunch, museum, beach…"
          />
        </label>
      </div>
      <details
        key={draft.id ?? "new"}
        className="group rounded-xl border border-line bg-surface/70 p-3"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-sm font-extrabold [&::-webkit-details-marker]:hidden">
          Timing, place & notes
          <ChevronDown className="size-4 text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 space-y-4 border-t border-line pt-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-label">
              Start (optional)
              <input
                type="datetime-local"
                value={draft.startsLocal}
                onChange={(event) => setDraft({ ...draft, startsLocal: event.target.value })}
                className="form-input"
              />
            </label>
            <label className="form-label">
              Duration in minutes
              <input
                type="number"
                inputMode="numeric"
                min="1"
                value={draft.durationMinutes}
                onChange={(event) => setDraft({ ...draft, durationMinutes: event.target.value })}
                className="form-input"
                placeholder="60"
              />
            </label>
          </div>
          <label className="form-label">
            Place
            <input
              value={draft.location}
              onChange={(event) => setDraft({ ...draft, location: event.target.value })}
              className="form-input"
              placeholder="Name or address"
            />
          </label>
          <label className="form-label">
            Map link
            <input
              type="url"
              value={draft.mapUrl}
              onChange={(event) => setDraft({ ...draft, mapUrl: event.target.value })}
              className="form-input"
              placeholder="https://maps.google.com/…"
            />
          </label>
          <label className="form-label">
            Notes
            <textarea
              value={draft.notes}
              onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              className="form-input min-h-24 resize-y"
              placeholder="Why this place, opening hours, what to order…"
            />
          </label>
        </div>
      </details>
      <div className="flex gap-2">
        <button type="submit" className="primary-button flex-1" disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          {draft.id ? "Save changes" : "Add item"}
        </button>
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PlanningItemsManager({
  tripId,
  planningEvent,
  travelerIds,
  itinerary,
  editable,
  onOpenEvent,
  focusedItemId,
  onFocusedItemChange,
  modalHost
}: {
  tripId: string;
  planningEvent: ItineraryItem;
  travelerIds: string[];
  itinerary: ItineraryItem[];
  editable: boolean;
  onOpenEvent?: (eventId: string) => void;
  focusedItemId?: string | null;
  onFocusedItemChange?: (itemId: string | null) => void;
  modalHost?: HTMLElement | null;
}) {
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const [draft, setDraft] = useState<PlanningDraft | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [promotionTypes, setPromotionTypes] = useState<Record<string, PlanningPromotionType>>({});
  const [notice, setNotice] = useState("");
  const [createdEvent, setCreatedEvent] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [pendingConversion, setPendingConversion] = useState<PendingConversion | null>(null);
  const [conversionTitle, setConversionTitle] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const queryKey = ["planning-items", planningEvent.id] as const;
  const itemsQuery = useQuery({
    queryKey,
    queryFn: () => listPlanningItems(planningEvent.id)
  });
  const items = itemsQuery.data ?? [];
  const inspectingItem = focusedItemId
    ? (items.find((candidate) => candidate.id === focusedItemId) ?? null)
    : null;
  const overlayHost =
    modalHost === undefined ? (typeof document === "undefined" ? null : document.body) : modalHost;
  const context: PlanningPromotionContext = useMemo(
    () => ({ tripId, planningEvent, travelerIds }),
    [planningEvent, travelerIds, tripId]
  );
  const routeSelectionActive = selectedIds.length > 0;

  useEffect(() => {
    if (!highlightedId) return;
    const timeout = window.setTimeout(() => setHighlightedId(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [highlightedId]);

  useEffect(() => {
    if (!draft) return;
    const frame = window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView?.({
        behavior: preferredScrollBehavior(),
        block: "center"
      });
      window.requestAnimationFrame(() => nameInputRef.current?.focus({ preventScroll: true }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [Boolean(draft), draft?.id]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] }),
      queryClient.invalidateQueries({ queryKey: ["bookings", tripId] }),
      queryClient.invalidateQueries({ queryKey: ["journey-legs", tripId] }),
      queryClient.invalidateQueries({ queryKey: ["cab-stops", tripId] })
    ]);
  };

  const save = useMutation({
    mutationFn: async (next: PlanningDraft) => {
      if (!next.title.trim()) throw new Error("Name this planning item.");
      const durationMinutes = next.durationMinutes
        ? Number.parseInt(next.durationMinutes, 10)
        : undefined;
      if (
        durationMinutes !== undefined &&
        (!Number.isFinite(durationMinutes) || durationMinutes <= 0)
      )
        throw new Error("Duration must be greater than zero.");
      const common = {
        planningEventId: planningEvent.id,
        kind: next.kind,
        title: next.title,
        startsAt: next.startsLocal
          ? localDateTimeToIso(next.startsLocal, planningEvent.timezone)
          : undefined,
        durationMinutes,
        location: next.location,
        mapUrl: secureMapUrl(next.mapUrl),
        timezone: planningEvent.timezone,
        notes: next.notes
      };
      return next.id
        ? updatePlanningItem({ ...common, id: next.id, version: next.version })
        : addPlanningItem(common);
    },
    onSuccess: async (saved, next) => {
      queryClient.setQueryData<PlanningItem[]>(queryKey, (current = []) =>
        [...current.filter((item) => item.id !== saved.id), saved].sort(
          (left, right) => left.item_order - right.item_order || left.id.localeCompare(right.id)
        )
      );
      setDraft(null);
      setNotice("Plan saved.");
      await refresh();
      if (!next.id) {
        setHighlightedId(saved.id);
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() =>
            document.getElementById(`plan-item-${saved.id}`)?.scrollIntoView({
              behavior: preferredScrollBehavior(),
              block: "center"
            })
          )
        );
      }
    }
  });
  const move = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) =>
      reorderPlanningItems(items, itemId, direction),
    onSuccess: async (rows) => {
      queryClient.setQueryData(queryKey, rows);
      await queryClient.invalidateQueries({ queryKey });
    }
  });
  const archive = useMutation({
    mutationFn: archivePlanningItem,
    onSuccess: async (_result, item) => {
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      setNotice("Item removed from the plan. Any linked event remains available.");
      await refresh();
    }
  });
  const promote = useMutation({
    mutationFn: ({ item, eventType }: { item: PlanningItem; eventType: PlanningPromotionType }) =>
      promotePlanningItem(context, item, eventType),
    onSuccess: async (event) => {
      setNotice("Event created and linked to this plan.");
      await refresh();
      onOpenEvent?.(event.id);
    }
  });
  const unlink = useMutation({
    mutationFn: unlinkPlanningItem,
    onSuccess: async () => {
      setNotice("Planning item unlinked. The event was not deleted.");
      await refresh();
    }
  });
  const createCab = useMutation({
    mutationFn: async (selected: PlanningItem[]) => {
      if (selected.length < 2) throw new Error("Select at least two consecutive plan items.");
      if (selected.some((item) => item.linked_itinerary_item_id))
        throw new Error("Unlink already-created events before using them in a new cab route.");
      const indexes = selected.map((item) =>
        items.findIndex((candidate) => candidate.id === item.id)
      );
      if (indexes.some((index, position) => position > 0 && index !== indexes[position - 1] + 1))
        throw new Error("Choose consecutive items so the cab route has a clear order.");
      if (!conversionTitle.trim()) throw new Error("Name this cab event.");
      return createCabRouteFromPlanning(context, selected, conversionTitle);
    },
    onSuccess: async (result) => {
      setSelectedIds([]);
      setConversionTitle("");
      await refresh();
      if (result.warnings.length) {
        setCreatedEvent({ id: result.itinerary.id, label: "Open cab event" });
        setNotice(`Cab event created. ${result.warnings.join(" ")}`);
      } else {
        setNotice("Cab route created and linked to the selected stops.");
        onOpenEvent?.(result.itinerary.id);
      }
    }
  });
  const createActivity = useMutation({
    mutationFn: async (selected: PlanningItem[]) => {
      if (selected.length < 2) throw new Error("Select at least two consecutive plan items.");
      if (selected.some((item) => item.linked_itinerary_item_id))
        throw new Error("Unlink already-created events before combining them into an activity.");
      const indexes = selected.map((item) =>
        items.findIndex((candidate) => candidate.id === item.id)
      );
      if (indexes.some((index, position) => position > 0 && index !== indexes[position - 1] + 1))
        throw new Error("Choose consecutive items so the activity keeps a clear order.");
      if (!conversionTitle.trim()) throw new Error("Name this activity.");
      return createActivityFromPlanning(context, selected, conversionTitle);
    },
    onSuccess: async (result) => {
      setSelectedIds([]);
      setConversionTitle("");
      await refresh();
      if (result.warnings.length) {
        setCreatedEvent({ id: result.itinerary.id, label: "Open activity" });
        setNotice(`Activity created. ${result.warnings.join(" ")}`);
      } else {
        setNotice("Activity created with the selected items as ordered Moments.");
        onOpenEvent?.(result.itinerary.id);
      }
    }
  });

  const error =
    itemsQuery.error ??
    save.error ??
    move.error ??
    archive.error ??
    promote.error ??
    unlink.error ??
    createActivity.error ??
    createCab.error;
  const busy =
    save.isPending ||
    move.isPending ||
    archive.isPending ||
    promote.isPending ||
    unlink.isPending ||
    createActivity.isPending ||
    createCab.isPending;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft) save.mutate(draft);
  };

  const openDraft = (next: PlanningDraft) => {
    setNotice("");
    setAdvancedOpen(false);
    setDraft(next);
  };

  const inspectItem = (item: PlanningItem) => {
    onFocusedItemChange?.(item.id);
  };

  const prepareCabConversion = () => {
    const selected = items.filter((item) => selectedIds.includes(item.id));
    if (selected.length < 2) return;
    setConversionTitle("");
    setPendingConversion({ kind: "cab", items: selected });
  };

  const prepareActivityConversion = () => {
    const selected = items.filter((item) => selectedIds.includes(item.id));
    if (selected.length < 2) return;
    setConversionTitle("");
    setPendingConversion({ kind: "activity", items: selected });
  };

  return (
    <section
      aria-label="Plan the day"
      className="mt-4 rounded-2xl border border-line bg-surface p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black">
            <CalendarClock className="size-4 text-brand" /> Plan the day
          </p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Put places, meals, transport, and free time in order. Turn them into real events when
            the plan becomes firm.
          </p>
        </div>
        {editable && !draft && (
          <button
            type="button"
            className="secondary-button min-h-9 px-3 py-2 text-xs"
            onClick={() => openDraft(emptyDraft())}
          >
            <Plus className="size-3.5" /> Add item
          </button>
        )}
      </div>

      {draft && !draft.id && (
        <PlanningItemForm
          draft={draft}
          setDraft={setDraft}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
          formRef={formRef}
          nameInputRef={nameInputRef}
          saving={save.isPending}
          onSubmit={submit}
          onCancel={() => setDraft(null)}
        />
      )}

      {itemsQuery.isPending ? (
        <p className="mt-3 inline-flex items-center gap-2 text-xs text-muted">
          <Loader2 className="size-3.5 animate-spin" /> Loading the day plan…
        </p>
      ) : items.length ? (
        <ol className="mt-3 space-y-1.5" aria-label="Plan sequence">
          {items.map((item, index) => {
            const linked = linkedPresentation(item, itinerary);
            const isLinked = Boolean(item.linked_itinerary_item_id);
            const selected = selectedIds.includes(item.id);
            return (
              <li
                key={item.id}
                id={`plan-item-${item.id}`}
                aria-label={`Plan item ${index + 1}: ${linked.title}`}
                className={`scroll-mt-24 rounded-xl border px-2 py-1.5 ${highlightedId === item.id ? "plan-item-added border-brand" : isLinked ? "border-brand/30 bg-brand-soft/20" : selected ? "border-brand/40 bg-brand-soft/20" : "border-transparent bg-elevated"}`}
              >
                <div className="flex min-w-0 items-center gap-1">
                  {editable && !isLinked && (
                    <label className="grid size-8 shrink-0 place-items-center" title="Select item">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          setSelectedIds((current) =>
                            event.target.checked
                              ? [...current, item.id]
                              : current.filter((id) => id !== item.id)
                          )
                        }
                        aria-label={`Select ${item.title} for event grouping`}
                        className="size-4 accent-[rgb(var(--color-brand))]"
                      />
                    </label>
                  )}
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[.65rem] font-black text-brand">
                    {index + 1}
                  </span>
                  <button
                    type="button"
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 text-left"
                    onClick={() => inspectItem(item)}
                    aria-label={`Open plan item ${item.title}`}
                  >
                    <strong className="min-w-0 truncate text-sm">{linked.title}</strong>
                    <span className="hidden shrink-0 text-[.62rem] font-black uppercase tracking-[.08em] text-muted sm:inline">
                      {kindLabels[item.kind]}
                    </span>
                    {item.starts_at && (
                      <span className="hidden shrink-0 text-xs text-muted md:inline">
                        · {linked.time}
                      </span>
                    )}
                    {isLinked && (
                      <Link2 aria-label="Linked event" className="size-3.5 shrink-0 text-brand" />
                    )}
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {linked.event && (
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-lg text-brand"
                        onClick={() => onOpenEvent?.(linked.event!.id)}
                        aria-label={`Open linked event ${linked.title}`}
                      >
                        <Link2 className="size-3.5" />
                      </button>
                    )}
                    {item.location?.map_url && (
                      <a
                        href={item.location.map_url}
                        target="_blank"
                        rel="noreferrer"
                        className="grid size-8 place-items-center rounded-lg text-brand"
                        aria-label={`Open map for ${item.title}`}
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
                          onClick={() => move.mutate({ itemId: item.id, direction: "up" })}
                          aria-label={`Move ${item.title} earlier`}
                        >
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25"
                          disabled={index === items.length - 1 || busy}
                          onClick={() => move.mutate({ itemId: item.id, direction: "down" })}
                          aria-label={`Move ${item.title} later`}
                        >
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-muted"
                          disabled={busy}
                          onClick={() => openDraft(draftFor(item))}
                          aria-label={`Edit ${item.title}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        {!isLinked && (
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg text-brand"
                            disabled={busy}
                            onClick={() => inspectItem(item)}
                            aria-label={`Convert ${item.title} to an event`}
                          >
                            <CalendarPlus2 className="size-3.5" />
                          </button>
                        )}
                        {isLinked && (
                          <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg text-muted"
                            disabled={busy}
                            onClick={() => unlink.mutate(item)}
                            aria-label={`Unlink ${item.title}`}
                          >
                            <Unlink className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          className="grid size-8 place-items-center rounded-lg text-danger"
                          disabled={busy}
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Remove planning item?",
                                message: `Remove ${item.title} from this plan? Any linked event remains.`,
                                confirmLabel: "Remove",
                                tone: "danger"
                              })
                            )
                              archive.mutate(item);
                          }}
                          aria-label={`Remove ${item.title}`}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {draft?.id === item.id && (
                  <PlanningItemForm
                    draft={draft}
                    setDraft={setDraft}
                    advancedOpen={advancedOpen}
                    setAdvancedOpen={setAdvancedOpen}
                    formRef={formRef}
                    nameInputRef={nameInputRef}
                    saving={save.isPending}
                    onSubmit={submit}
                    onCancel={() => setDraft(null)}
                  />
                )}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-3 rounded-xl bg-elevated p-3 text-xs leading-5 text-muted">
          Start with the places you want to visit. Times are optional, and you can make each item a
          proper event later.
        </p>
      )}

      {editable && selectedIds.length > 0 && (
        <div className="mt-3 rounded-xl border border-brand/30 bg-brand-soft/20 p-3">
          <p className="text-xs text-muted">
            Select consecutive items, then combine them into one activity with ordered Moments or
            one cab journey with ordered stops.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className="primary-button w-full"
              disabled={busy || selectedIds.length < 2}
              onClick={prepareActivityConversion}
            >
              {createActivity.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              Create activity · {selectedIds.length} Moments
            </button>
            <button
              type="button"
              className="secondary-button w-full"
              disabled={busy || selectedIds.length < 2}
              onClick={prepareCabConversion}
            >
              {createCab.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <CarTaxiFront className="size-4" />
              )}
              Create cab · {selectedIds.length} stops
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="mt-3 rounded-xl bg-success/10 p-3 text-xs font-bold text-success"
        >
          {notice}
          {createdEvent && (
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => onOpenEvent?.(createdEvent.id)}
            >
              {createdEvent.label}
            </button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-xs font-bold text-danger">
          {getErrorMessage(error)}
        </p>
      )}
      {overlayHost &&
        createPortal(
          <>
            {inspectingItem && (
              <ModalSheet
                eyebrow={kindLabels[inspectingItem.kind]}
                title={inspectingItem.title}
                manageHistory={false}
                onClose={() => onFocusedItemChange?.(null)}
              >
                {(() => {
                  const eventType =
                    promotionTypes[inspectingItem.id] ?? preferredPromotion(inspectingItem.kind);
                  return (
                    <>
                      <div className="mt-4 rounded-2xl bg-elevated p-4">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
                          <span className="inline-flex items-center gap-1.5">
                            <Clock3 className="size-3.5" /> {itemTimeLabel(inspectingItem)}
                          </span>
                          {inspectingItem.location?.label && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <MapPin className="size-3.5 shrink-0" />
                              <span className="truncate">{inspectingItem.location.label}</span>
                            </span>
                          )}
                        </div>
                        {inspectingItem.notes && (
                          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-muted">
                            {inspectingItem.notes}
                          </p>
                        )}
                      </div>
                      {editable && (
                        <div className="mt-4 space-y-3">
                          {inspectingItem.linked_itinerary_item_id ? (
                            <button
                              type="button"
                              className="primary-button w-full"
                              onClick={() =>
                                onOpenEvent?.(inspectingItem.linked_itinerary_item_id!)
                              }
                            >
                              <Link2 className="size-4" /> Open linked event
                            </button>
                          ) : (
                            <>
                              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                <label className="sr-only" htmlFor={`promote-${inspectingItem.id}`}>
                                  Event type for {inspectingItem.title}
                                </label>
                                <select
                                  id={`promote-${inspectingItem.id}`}
                                  value={eventType}
                                  disabled={routeSelectionActive || busy}
                                  onChange={(event) =>
                                    setPromotionTypes((current) => ({
                                      ...current,
                                      [inspectingItem.id]: event.target
                                        .value as PlanningPromotionType
                                    }))
                                  }
                                  className="form-input mt-0 min-w-0"
                                >
                                  {Object.entries(promotionLabels).map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  className="primary-button min-h-11 whitespace-nowrap px-3 py-2 text-xs"
                                  disabled={busy || routeSelectionActive}
                                  onClick={() => {
                                    onFocusedItemChange?.(null);
                                    setPendingConversion({
                                      kind: "event",
                                      item: inspectingItem,
                                      eventType
                                    });
                                  }}
                                >
                                  <CalendarPlus2 className="size-3.5" /> Turn into event
                                </button>
                              </div>
                              {routeSelectionActive && (
                                <p className="text-xs font-bold text-muted">
                                  Clear the current group selection to create this as its own event.
                                </p>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            className="secondary-button w-full"
                            onClick={() => {
                              onFocusedItemChange?.(null);
                              openDraft(draftFor(inspectingItem));
                            }}
                          >
                            <Pencil className="size-4" /> Edit plan item
                          </button>
                        </div>
                      )}
                    </>
                  );
                })()}
              </ModalSheet>
            )}
            {pendingConversion && (
              <ModalSheet
                eyebrow="Before you continue"
                title={
                  pendingConversion.kind === "cab"
                    ? "Create this cab route?"
                    : pendingConversion.kind === "activity"
                      ? "Create this activity?"
                      : `Create ${promotionLabels[pendingConversion.eventType].toLowerCase()}?`
                }
                onClose={() => {
                  setPendingConversion(null);
                  setConversionTitle("");
                }}
              >
                {(() => {
                  const eventType =
                    pendingConversion.kind === "cab"
                      ? "cab"
                      : pendingConversion.kind === "activity"
                        ? "activity"
                        : pendingConversion.eventType;
                  const sourceTitle =
                    pendingConversion.kind === "cab" || pendingConversion.kind === "activity"
                      ? `${pendingConversion.items[0].title} → ${pendingConversion.items.at(-1)!.title}`
                      : pendingConversion.item.title;
                  return (
                    <>
                      <div
                        className={`event-modal-scene event-type-icon--${eventType} relative mt-4 isolate overflow-hidden rounded-2xl p-4 pr-20`}
                      >
                        <EventSilhouette type={eventType} placement="modal" />
                        <div className="relative z-[1] flex items-start gap-3">
                          <EventTypeIcon type={eventType} className="size-10 rounded-xl" />
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-[.12em] text-muted">
                              {pendingConversion.kind === "cab"
                                ? `${pendingConversion.items.length} ordered stops`
                                : pendingConversion.kind === "activity"
                                  ? `${pendingConversion.items.length} ordered Moments`
                                  : promotionLabels[pendingConversion.eventType]}
                            </p>
                            <p className="mt-1 break-words font-display text-lg font-black">
                              {sourceTitle}
                            </p>
                          </div>
                        </div>
                      </div>
                      {(pendingConversion.kind === "cab" ||
                        pendingConversion.kind === "activity") && (
                        <label className="form-label mt-4">
                          {pendingConversion.kind === "cab" ? "Cab event name" : "Activity name"}
                          <input
                            required
                            autoFocus
                            className="form-input"
                            value={conversionTitle}
                            onChange={(event) => setConversionTitle(event.target.value)}
                            placeholder={
                              pendingConversion.kind === "cab"
                                ? `Cab · ${pendingConversion.items[0].title} → ${pendingConversion.items.at(-1)!.title}`
                                : `${pendingConversion.items[0].title} and more`
                            }
                          />
                        </label>
                      )}
                      <div className="mt-4 flex items-start gap-2 rounded-xl bg-warning/10 p-3 text-sm">
                        <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                        <div>
                          <p className="font-extrabold">What happens next</p>
                          {pendingConversion.kind === "cab" ? (
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                              <li>One planned cab event is created.</li>
                              <li>
                                Every selected item becomes an ordered stop, including pickup and
                                drop-off.
                              </li>
                              <li>Each planning item stays here and links to the new cab event.</li>
                            </ul>
                          ) : pendingConversion.kind === "activity" ? (
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                              <li>One activity event is created.</li>
                              <li>Every selected plan item becomes an ordered Moment inside it.</li>
                              <li>Each planning item stays here and links to the new activity.</li>
                            </ul>
                          ) : (
                            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
                              <li>
                                Its name, date, time, place, notes, and travelers are copied into
                                the new event.
                              </li>
                              <li>The planning item stays in this day plan as a linked summary.</li>
                              <li>The new event opens after it is created.</li>
                            </ul>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => setPendingConversion(null)}
                        >
                          Keep planning
                        </button>
                        <button
                          type="button"
                          className="primary-button"
                          disabled={
                            (pendingConversion.kind === "cab" ||
                              pendingConversion.kind === "activity") &&
                            !conversionTitle.trim()
                          }
                          onClick={() => {
                            if (pendingConversion.kind === "cab")
                              createCab.mutate(pendingConversion.items);
                            else if (pendingConversion.kind === "activity")
                              createActivity.mutate(pendingConversion.items);
                            else
                              promote.mutate({
                                item: pendingConversion.item,
                                eventType: pendingConversion.eventType
                              });
                            setPendingConversion(null);
                          }}
                        >
                          {pendingConversion.kind === "cab" ? (
                            <CarTaxiFront className="size-4" />
                          ) : pendingConversion.kind === "activity" ? (
                            <Sparkles className="size-4" />
                          ) : (
                            <CalendarPlus2 className="size-4" />
                          )}
                          {pendingConversion.kind === "cab"
                            ? "Create cab route"
                            : pendingConversion.kind === "activity"
                              ? "Create activity"
                              : `Create ${promotionLabels[pendingConversion.eventType].toLowerCase()}`}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </ModalSheet>
            )}
          </>,
          overlayHost
        )}
    </section>
  );
}
