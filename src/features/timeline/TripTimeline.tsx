import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { EventTypeIcon } from "../../components/EventTypeIcon";
import { formatEventTime, formatItineraryDate, itineraryDateKey } from "../trips/presentation";
import { eventTimeLabel, timelineEntryPhase, type TripTimelineEntry } from "./model";
import { revealExpandedTimelineEvent } from "./scroll";
import { TimelineFilters, type TimelineViewState } from "./TimelineFilters";

export type TimelineHandle = { reveal: (id: string) => void };
type ViewState = TimelineViewState;

function readView(key: string): ViewState | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value && Array.isArray(value.expanded) && Array.isArray(value.collapsedDates)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function timelineDateKey(entry: TripTimelineEntry) {
  return entry.kind === "event" && entry.item.timing_mode === "unscheduled"
    ? "unscheduled"
    : itineraryDateKey(entry.startsAt, entry.timezone);
}

/** One compact plan; date visibility and event detail are independent choices. */
export const TripTimeline = forwardRef<
  TimelineHandle,
  {
    entries: TripTimelineEntry[];
    activeId?: string;
    activeCaption?: string;
    ready?: boolean;
    storageKey: string;
    onJump: (id: string) => void;
    renderDetail: (entry: TripTimelineEntry) => ReactNode;
    entrySubtitle?: (entry: TripTimelineEntry) => string | undefined;
    title?: string;
    calendarAction?: ReactNode;
    taskControl?: (entry: TripTimelineEntry) =>
      | {
          checked: boolean;
          disabled?: boolean;
          onToggle: (checked: boolean) => void;
          onOpen: () => void;
        }
      | undefined;
  }
>(
  (
    {
      entries,
      activeId: requestedActiveId,
      activeCaption,
      ready = true,
      storageKey,
      onJump,
      renderDetail,
      entrySubtitle,
      title = "Timeline",
      calendarAction,
      taskControl
    },
    ref
  ) => {
    const activeEntry = entries.find(
      (entry) =>
        entry.id === requestedActiveId &&
        (entry.kind === "event" || !["complete", "not_required"].includes(entry.requirement.status))
    );
    const activeId = activeEntry?.id;
    const caption =
      activeEntry?.kind === "requirement"
        ? "To do"
        : (activeCaption ??
          (activeEntry && timelineEntryPhase(activeEntry) === "past"
            ? "Latest"
            : activeEntry && timelineEntryPhase(activeEntry) === "current"
              ? "Now"
              : "Next"));
    const [saved, setSaved] = useState<ViewState | null>(() => readView(storageKey));
    const manuallyExpanded = useRef<string | null>(null);
    useLayoutEffect(() => {
      const id = manuallyExpanded.current;
      if (!id) return;
      manuallyExpanded.current = null;
      const frame = window.requestAnimationFrame(() => revealExpandedTimelineEvent(id));
      return () => window.cancelAnimationFrame(frame);
    }, [saved]);
    const state = saved ?? { expanded: activeId ? [activeId] : [], collapsedDates: [] };
    const [viewOpen, setViewOpen] = useState(false);
    const [dateFilter, setDateFilter] = useState("all");
    const viewTrigger = useRef<HTMLButtonElement>(null);
    const groups = useMemo(() => {
      const result: { key: string; entries: TripTimelineEntry[] }[] = [];
      // Preserve explicit before/after ordering, even across local date boundaries.
      entries.forEach((entry) => {
        const key = timelineDateKey(entry);
        const last = result.at(-1);
        if (last?.key === key) last.entries.push(entry);
        else result.push({ key, entries: [entry] });
      });
      return result;
    }, [entries]);
    const itinerary = useMemo(
      () => entries.flatMap((entry) => (entry.kind === "event" ? [entry.item] : [])),
      [entries]
    );
    useEffect(() => {
      if (ready && !saved && entries.length && activeId)
        setSaved({ expanded: [activeId], collapsedDates: [] });
    }, [activeId, entries.length, saved, ready]);
    useEffect(() => {
      if (!saved) return;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {
        /* Optional UI memory. */
      }
    }, [saved, storageKey]);
    useImperativeHandle(
      ref,
      () => ({
        reveal(id) {
          const entry = entries.find((entry) => entry.id === id);
          if (!entry) return;
          setDateFilter("all");
          setSaved((current) => ({
            expanded: [...new Set([...(current?.expanded ?? (activeId ? [activeId] : [])), id])],
            collapsedDates: (current?.collapsedDates ?? []).filter(
              (key) => key !== timelineDateKey(entry)
            )
          }));
        }
      }),
      [entries, activeId]
    );
    const toggle = (field: keyof ViewState, value: string) =>
      setSaved((current) => {
        const next = current ?? state;
        return {
          ...next,
          [field]: next[field].includes(value)
            ? next[field].filter((id) => id !== value)
            : [...next[field], value]
        };
      });
    const dateOptions = groups.reduce<{ key: string; label: string; count: number }[]>(
      (options, group) => {
        const existing = options.find((option) => option.key === group.key);
        if (existing) existing.count += group.entries.length;
        else
          options.push({
            key: group.key,
            label:
              group.key === "unscheduled"
                ? "Unscheduled"
                : formatItineraryDate(group.entries[0].startsAt, group.entries[0].timezone),
            count: group.entries.length
          });
        return options;
      },
      []
    );
    return (
      <div>
        <div className="relative mb-3 flex items-center justify-between gap-2 px-3 sm:px-0">
          <h2 className="min-w-0 break-words font-display text-xl font-black sm:text-2xl [overflow-wrap:anywhere]">
            {title}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            {dateFilter !== "all" && (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-bold text-brand hover:bg-brand-soft"
                onClick={() => {
                  setDateFilter("all");
                  viewTrigger.current?.focus({ preventScroll: true });
                }}
              >
                <X aria-hidden="true" className="size-3.5" /> Remove filters
              </button>
            )}
            <button
              ref={viewTrigger}
              type="button"
              className={`tap-target relative grid shrink-0 place-items-center rounded-xl border ${dateFilter !== "all" ? "border-brand bg-brand text-surface" : "border-line bg-surface"}`}
              aria-label="Filter timeline"
              aria-haspopup="dialog"
              aria-expanded={viewOpen}
              aria-pressed={dateFilter !== "all"}
              title={dateFilter !== "all" ? "1 date filter applied" : "Filter timeline"}
              onClick={() => setViewOpen(true)}
            >
              <SlidersHorizontal aria-hidden="true" className="size-5" />
              {dateFilter !== "all" && (
                <span
                  aria-hidden="true"
                  className="absolute right-1 -top-1 grid size-4 place-items-center rounded-full bg-coral text-[10px] font-black text-surface ring-2 ring-canvas"
                >
                  1
                </span>
              )}
            </button>
          </div>
        </div>
        {viewOpen && (
          <TimelineFilters
            initial={{ ...state, date: dateFilter }}
            dates={dateOptions}
            entryIds={entries.map((entry) => entry.id)}
            activeId={activeId}
            priorityLabel={
              caption === "To do"
                ? "Priority task"
                : caption === "Latest"
                  ? "Latest event"
                  : caption === "Now"
                    ? "Current event"
                    : "Next event"
            }
            calendarAction={calendarAction}
            onJump={onJump}
            onClose={() => setViewOpen(false)}
            onApply={({ date, ...view }) => {
              setDateFilter(date);
              setSaved(view);
              setViewOpen(false);
            }}
          />
        )}
        <div className="relative space-y-1 pl-3 before:absolute before:bottom-0 before:left-0.5 before:top-5 before:w-px before:bg-line sm:space-y-2 sm:pl-4">
          {groups
            .filter((group) => dateFilter === "all" || group.key === dateFilter)
            .map((group, index) => {
              const first = group.entries[0];
              const dateOpen = !state.collapsedDates.includes(group.key);
              const label =
                group.key === "unscheduled"
                  ? "Unscheduled"
                  : formatItineraryDate(first.startsAt, first.timezone);
              return (
                <section key={`${group.key}:${first.id}`}>
                  <h3>
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 text-left"
                      aria-expanded={dateOpen}
                      aria-controls={`timeline-date-${index}`}
                      onClick={() => toggle("collapsedDates", group.key)}
                    >
                      <span className="text-base font-extrabold sm:text-lg">{label}</span>
                      <span className="h-px flex-1 bg-line" />
                      <span className="text-xs text-muted">{group.entries.length}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`size-4 shrink-0 transition-transform ${dateOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                  </h3>
                  <div id={`timeline-date-${index}`} hidden={!dateOpen} className="space-y-2">
                    {group.entries.map((entry) => {
                      const current = entry.id === activeId;
                      const expanded = state.expanded.includes(entry.id);
                      const title =
                        entry.kind === "event" ? entry.item.title : entry.requirement.title;
                      const timing =
                        entry.kind === "event"
                          ? (eventTimeLabel(entry.item, itinerary) ??
                            formatEventTime(entry.startsAt, entry.timezone).split(",").at(-1))
                          : entry.scheduleLabel;
                      const type =
                        entry.kind === "event"
                          ? (entry.item.event_type ?? "custom")
                          : "preparation";
                      const typeLabel =
                        type === "hotel_check_in"
                          ? "Check-in"
                          : type === "hotel_check_out"
                            ? "Check-out"
                            : type.replaceAll("_", " ");
                      const location =
                        entrySubtitle?.(entry) ??
                        (entry.kind === "event" ? entry.item.location?.label : undefined);
                      const status =
                        entry.kind === "event" &&
                        entry.item.event_status &&
                        entry.item.event_status !== "planned"
                          ? entry.item.event_status
                          : null;
                      const task = taskControl?.(entry);
                      return (
                        <div key={entry.id} className="relative">
                          <span
                            aria-hidden="true"
                            className={`absolute -left-3 top-7 size-[5px] rounded-full ring-[3px] ring-canvas sm:-left-4 ${current ? (task ? "bg-warning" : "bg-coral") : task ? "bg-muted" : "bg-brand"}`}
                          />
                          <article
                            key={entry.id}
                            id={`timeline-${entry.id}`}
                            data-trip-scroll-anchor="timeline"
                            className={`timeline-outline-card overflow-hidden border ${task ? (current ? "rounded-lg border-warning bg-warning/10" : "rounded-lg border-dashed border-brand/40 bg-brand-soft/40") : `timeline-event-card rounded-2xl bg-surface ${current ? "border-coral" : "border-line"}`}`}
                            data-readiness={task ? "true" : undefined}
                            aria-current={current ? "step" : undefined}
                          >
                            {task ? (
                              <div className="flex min-h-16 items-center gap-1 px-1 sm:px-2">
                                <label
                                  className={`tap-target flex shrink-0 flex-col items-center justify-center gap-1 self-stretch ${current ? "text-warning" : "text-brand"}`}
                                >
                                  <input
                                    type="checkbox"
                                    className={`size-5 ${current ? "accent-warning" : "accent-brand"}`}
                                    checked={task.checked}
                                    disabled={task.disabled}
                                    aria-label={`${task.checked ? "Mark as not done" : "Mark as done"}: ${title}`}
                                    onChange={(event) => task.onToggle(event.target.checked)}
                                  />
                                  <span
                                    aria-hidden="true"
                                    className="text-[9px] font-black uppercase leading-none tracking-wide"
                                  >
                                    Task
                                  </span>
                                </label>
                                <button
                                  type="button"
                                  data-timeline-trigger
                                  className="flex min-h-16 min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
                                  onClick={task.onOpen}
                                  aria-label={`View details for ${title}`}
                                >
                                  <span className="min-w-0 flex-1">
                                    <span
                                      className={`block truncate text-sm font-extrabold sm:text-base ${task.checked ? "text-muted line-through" : ""}`}
                                    >
                                      {title}
                                    </span>
                                    <span className="block truncate text-xs text-muted sm:text-sm">
                                      {timing}
                                    </span>
                                  </span>
                                  {current && (
                                    <span className="shrink-0 whitespace-nowrap rounded-full bg-warning px-2.5 py-1.5 text-[10px] font-black uppercase leading-none tracking-wide text-surface">
                                      To do
                                    </span>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <>
                                <h4>
                                  <button
                                    type="button"
                                    data-timeline-trigger
                                    className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left"
                                    aria-expanded={expanded}
                                    aria-controls={`event-card-${entry.id}`}
                                    aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
                                    onClick={() => {
                                      manuallyExpanded.current = expanded ? null : entry.id;
                                      toggle("expanded", entry.id);
                                    }}
                                  >
                                    <EventTypeIcon
                                      type={type}
                                      className="size-8 shrink-0 rounded-lg"
                                      iconClassName="size-4"
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-2">
                                        <span className="truncate text-sm font-extrabold sm:text-base">
                                          {title}
                                        </span>
                                        {current && (
                                          <span className="shrink-0 rounded-full bg-coral px-2 py-0.5 text-[10px] font-black uppercase text-surface">
                                            {caption}
                                          </span>
                                        )}
                                      </span>
                                      <span className="block truncate text-xs text-muted sm:text-sm">
                                        <strong>{timing}</strong> ·{" "}
                                        <span className="font-semibold capitalize">
                                          {typeLabel}
                                        </span>
                                        {status && ` · ${status}`}
                                        {location && ` · ${location}`}
                                      </span>
                                    </span>
                                    <ChevronDown
                                      aria-hidden="true"
                                      className={`size-4 shrink-0 text-muted transition-transform ${expanded ? "rotate-180" : "-rotate-90"}`}
                                    />
                                  </button>
                                </h4>
                                <div
                                  id={`event-card-${entry.id}`}
                                  hidden={!expanded}
                                  className="timeline-card-detail relative isolate border-t border-line p-3 sm:p-5"
                                >
                                  {expanded && renderDetail(entry)}
                                </div>
                              </>
                            )}
                          </article>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
        </div>
      </div>
    );
  }
);
