import { ChevronDown, ChevronRight, LocateFixed, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EventTypeIcon } from "../../components/EventTypeIcon";
import { ModalSheet } from "../../components/ModalSheet";
import { eventTimeLabel, timelineEntryPhase, type TripTimelineEntry } from "../timeline/model";
import { formatItineraryDate, itineraryDateKey } from "./presentation";
import type { ItineraryItem, TimelineEventType } from "./types";

type AgendaFilter = "all" | "travel" | "stay" | "activity";

type AgendaGroup = {
  key: string;
  label: string;
  entries: TripTimelineEntry[];
};

const filterChoices: Array<{ value: AgendaFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "travel", label: "Travel" },
  { value: "stay", label: "Stay" },
  { value: "activity", label: "Activities" }
];

const travelTypes = new Set<TimelineEventType>([
  "flight",
  "train",
  "bus",
  "ferry",
  "cab",
  "transport"
]);

function entryType(entry: TripTimelineEntry): TimelineEventType {
  return entry.kind === "event" ? (entry.item.event_type ?? "custom") : "preparation";
}

function filterForEntry(entry: TripTimelineEntry): Exclude<AgendaFilter, "all"> {
  const type = entryType(entry);
  if (travelTypes.has(type)) return "travel";
  if (type === "hotel_check_in" || type === "hotel_check_out") return "stay";
  return "activity";
}

function entryTitle(entry: TripTimelineEntry) {
  return entry.kind === "event" ? entry.item.title : entry.requirement.title;
}

function entryContext(entry: TripTimelineEntry) {
  if (entry.kind === "requirement") return "Readiness task";
  return entry.item.location?.label || (entry.item.event_type ?? "custom").replaceAll("_", " ");
}

function groupKey(entry: TripTimelineEntry) {
  if (entry.kind === "event" && entry.item.timing_mode === "unscheduled") return "unscheduled";
  return itineraryDateKey(entry.startsAt, entry.timezone);
}

function groupLabel(entry: TripTimelineEntry) {
  if (groupKey(entry) === "unscheduled") return "No date yet";
  return formatItineraryDate(entry.startsAt, entry.timezone);
}

function defaultExpandedGroupKeys(entries: TripTimelineEntry[]) {
  const keys = new Set<string>();
  for (const entry of entries) {
    const phase = timelineEntryPhase(entry);
    if (phase === "current" || phase === "future") keys.add(groupKey(entry));
  }
  return keys;
}

function clockLabel(entry: TripTimelineEntry, itinerary: ItineraryItem[]) {
  if (entry.kind === "requirement") return entry.scheduleLabel;
  const descriptive = eventTimeLabel(entry.item, itinerary);
  if (descriptive) return descriptive;
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: entry.timezone
  }).format(new Date(entry.startsAt));
}

function matchesSearch(entry: TripTimelineEntry, search: string) {
  if (!search) return true;
  const detail =
    entry.kind === "event"
      ? `${entry.item.location?.label ?? ""} ${entry.item.location?.address ?? ""}`
      : entry.scheduleLabel;
  return `${entryTitle(entry)} ${entryContext(entry)} ${detail}`.toLowerCase().includes(search);
}

function AgendaEntryRow({
  entry,
  itinerary,
  active,
  onSelect
}: {
  entry: TripTimelineEntry;
  itinerary: ItineraryItem[];
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const title = entryTitle(entry);
  const phase = timelineEntryPhase(entry);
  const activeLabel =
    phase === "current" ? "Now" : phase === "future" ? "Next" : phase === "past" ? "Last" : "Open";
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.id)}
      className={`group grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition hover:border-brand/50 hover:bg-elevated focus-visible:ring-2 focus-visible:ring-brand sm:grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:gap-3 sm:px-3 sm:py-2.5 ${
        active ? "border-coral bg-coral/10" : "border-line bg-surface"
      }`}
      aria-label={`View ${title} in timeline`}
    >
      <EventTypeIcon
        type={entryType(entry)}
        className="size-8 rounded-lg sm:size-9"
        iconClassName="size-4"
      />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-2">
          <strong className="truncate text-sm">{title}</strong>
          {active && (
            <span className="shrink-0 rounded-full bg-coral px-2 py-0.5 text-[.55rem] font-black uppercase tracking-wide text-white">
              {activeLabel}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex min-w-0 gap-2 text-xs text-muted">
          <span className="shrink-0 font-bold">{clockLabel(entry, itinerary)}</span>
          <span aria-hidden="true">·</span>
          <span className="truncate capitalize">{entryContext(entry)}</span>
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

export function TripAgendaSheet({
  entries,
  activeEntryId,
  onClose,
  onSelect
}: {
  entries: TripTimelineEntry[];
  activeEntryId?: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AgendaFilter>("all");
  const [dateFilter, setDateFilter] = useState("all");
  const activeEntry = entries.find((entry) => entry.id === activeEntryId);
  const activeGroupKey = activeEntry ? groupKey(activeEntry) : null;
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = defaultExpandedGroupKeys(entries);
    if (activeGroupKey) initial.add(activeGroupKey);
    return initial;
  });
  const itinerary = useMemo(
    () => entries.flatMap((entry) => (entry.kind === "event" ? [entry.item] : [])),
    [entries]
  );
  const normalizedSearch = search.trim().toLowerCase();
  const dateChoices = useMemo(() => {
    const choices = new Map<string, string>();
    for (const entry of entries) {
      const key = groupKey(entry);
      if (!choices.has(key)) choices.set(key, groupLabel(entry));
    }
    return [...choices.entries()].map(([value, label]) => ({ value, label }));
  }, [entries]);
  const groups = useMemo(() => {
    const grouped = new Map<string, AgendaGroup>();
    for (const entry of entries) {
      if (filter !== "all" && filterForEntry(entry) !== filter) continue;
      if (!matchesSearch(entry, normalizedSearch)) continue;
      const key = groupKey(entry);
      if (dateFilter !== "all" && key !== dateFilter) continue;
      const existing = grouped.get(key);
      if (existing) existing.entries.push(entry);
      else grouped.set(key, { key, label: groupLabel(entry), entries: [entry] });
    }
    return [...grouped.values()];
  }, [dateFilter, entries, filter, normalizedSearch]);

  useEffect(() => {
    if (!activeGroupKey) return;
    setExpandedGroups((current) =>
      current.has(activeGroupKey) ? current : new Set([...current, activeGroupKey])
    );
  }, [activeGroupKey]);

  const toggleGroup = (key: string) =>
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const activePhase = activeEntry ? timelineEntryPhase(activeEntry) : null;
  const activeCaption =
    activePhase === "current"
      ? "Happening now"
      : activePhase === "future"
        ? "Next on your trip"
        : activePhase === "past"
          ? "Latest on this trip"
          : "Needs scheduling";

  return (
    <ModalSheet
      eyebrow="Timeline navigator"
      title="Trip agenda"
      onClose={onClose}
      manageHistory={false}
      placement="end"
    >
      {activeEntry && (
        <button
          type="button"
          onClick={() => onSelect(activeEntry.id)}
          className="mt-4 flex w-full items-center gap-2.5 rounded-2xl bg-brand px-3 py-2.5 text-left text-surface shadow-soft focus-visible:ring-2 focus-visible:ring-brand sm:mt-5 sm:gap-3 sm:px-4 sm:py-3"
          aria-label={`Jump to now: ${entryTitle(activeEntry)}`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface/15 sm:size-10 sm:rounded-xl">
            <LocateFixed className="size-4 sm:size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[.65rem] font-black uppercase tracking-[.14em] text-surface/65">
              {activeCaption}
            </span>
            <strong className="mt-0.5 block truncate text-sm">{entryTitle(activeEntry)}</strong>
          </span>
          <ChevronRight className="size-4 shrink-0" />
        </button>
      )}

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="form-input mt-0 pl-10"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search events"
            aria-label="Search trip agenda"
          />
        </div>
        <select
          className="form-input mt-0 min-w-0 px-3 text-xs font-bold"
          value={dateFilter}
          onChange={(event) => setDateFilter(event.target.value)}
          aria-label="Filter agenda by date"
        >
          <option value="all">All dates</option>
          {dateChoices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Agenda filters">
        {filterChoices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            onClick={() => setFilter(choice.value)}
            className={`shrink-0 rounded-full border px-2.5 py-1.5 text-xs font-black sm:px-3 sm:py-2 ${
              filter === choice.value
                ? "border-brand bg-brand text-surface"
                : "border-line bg-elevated text-muted"
            }`}
            aria-pressed={filter === choice.value}
          >
            {choice.label}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2 sm:mt-4 sm:space-y-3">
        {groups.map((group) => {
          const expanded =
            Boolean(normalizedSearch) || dateFilter !== "all" || expandedGroups.has(group.key);
          return (
            <section key={group.key}>
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="group/date flex w-full items-center gap-2 py-1 text-left sm:gap-3 sm:py-1.5"
                aria-expanded={expanded}
              >
                <strong className="shrink-0 text-sm font-extrabold text-ink">{group.label}</strong>
                <span className="h-px min-w-4 flex-1 bg-line" aria-hidden="true" />
                <span className="shrink-0 text-[.65rem] font-bold text-muted">
                  {group.entries.length}
                </span>
                <ChevronDown
                  className={`size-3.5 shrink-0 text-muted transition-transform group-hover/date:text-ink ${expanded ? "rotate-180" : ""}`}
                />
              </button>
              {expanded && (
                <div className="space-y-1.5 pt-1 sm:space-y-2 sm:pt-1.5">
                  {group.entries.map((entry) => (
                    <AgendaEntryRow
                      key={entry.id}
                      entry={entry}
                      itinerary={itinerary}
                      active={entry.id === activeEntryId}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {!groups.length && (
        <p className="mt-5 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-muted">
          No agenda items match this search or filter.
        </p>
      )}
    </ModalSheet>
  );
}
