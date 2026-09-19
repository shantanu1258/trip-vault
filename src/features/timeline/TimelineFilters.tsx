import { LocateFixed, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalHistory } from "../../components/ModalHistoryProvider";
import { EventTypeIcon } from "../../components/EventTypeIcon";
import type { TimelineEventType } from "../trips/types";
import { eventTypeChoices } from "./eventTypeChoices";

export type TimelineViewState = { expanded: string[]; collapsedDates: string[] };
type FilterState = TimelineViewState & { date: string; eventType: "all" | TimelineEventType };
type DateOption = { key: string; label: string; count: number };
const sameIds = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id) => right.includes(id));

function FilterChoice({
  name,
  label,
  checked,
  count,
  icon,
  onChange
}: {
  name: string;
  label: string;
  checked: boolean;
  count?: number;
  icon?: ReactNode;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm ${checked ? "bg-brand-soft font-bold text-brand" : "text-ink hover:bg-elevated"}`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 accent-brand"
      />
      {icon}
      <span className="min-w-0 flex-1">{label}</span>
      {count !== undefined && (
        <span aria-hidden="true" className="text-xs tabular-nums text-muted">
          {count}
        </span>
      )}
    </label>
  );
}

/** Draft filters stay local until Apply; closing never changes the timeline. */
export function TimelineFilters({
  initial,
  dates,
  entryIds,
  items,
  activeId,
  priorityLabel,
  calendarAction,
  onJump,
  onApply,
  onClose
}: {
  initial: FilterState;
  dates: DateOption[];
  entryIds: string[];
  items: { date: string; type: TimelineEventType }[];
  activeId?: string;
  priorityLabel: string;
  calendarAction?: ReactNode;
  onJump: (id: string) => void;
  onApply: (value: FilterState) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [section, setSection] = useState<"dates" | "types" | "display">("dates");
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const radioId = useId();
  const dateKeys = dates.map((date) => date.key);
  const defaultExpanded = activeId ? [activeId] : [];
  const dateMode = (value: string[]) =>
    value.length === 0 ? "expanded" : sameIds(value, dateKeys) ? "collapsed" : "custom";
  const cardMode = (value: string[]) =>
    sameIds(value, defaultExpanded) && activeId
      ? "priority"
      : value.length === 0
        ? "collapsed"
        : sameIds(value, entryIds)
          ? "expanded"
          : "custom";
  const matchingCount = (date: string, eventType: string) =>
    items.filter(
      (item) =>
        (date === "all" || item.date === date) && (eventType === "all" || item.type === eventType)
    ).length;
  const count = matchingCount(draft.date, draft.eventType);
  useModalHistory(onClose);
  useEffect(() => {
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:justify-end"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="sheet-enter flex h-[min(36rem,92dvh)] w-full flex-col overflow-hidden rounded-t-2xl bg-surface shadow-focus sm:h-full sm:max-w-md sm:rounded-none"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
          if (event.key !== "Tab") return;
          const controls = Array.from(
            dialog.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), a[href], input:not([disabled])"
            ) ?? []
          ).filter((element) => !(element instanceof HTMLInputElement) || element.checked);
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
          <h2 id={titleId} className="text-lg font-extrabold">
            Timeline filters
          </h2>
          <button
            ref={closeButton}
            type="button"
            aria-label="Close timeline filters"
            className="tap-target grid shrink-0 place-items-center rounded-lg hover:bg-elevated"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1">
          <nav
            aria-label="Filter sections"
            className="w-24 shrink-0 border-r border-line bg-elevated/60 py-2"
          >
            {(["dates", "types", "display"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={section === key}
                className={`min-h-16 w-full border-l-[3px] px-3 py-3 text-left ${section === key ? "border-brand bg-surface text-brand" : "border-transparent text-muted"}`}
                onClick={() => setSection(key)}
              >
                <span className="block text-sm font-bold">
                  {key === "dates" ? "Dates" : key === "types" ? "Event type" : "Display"}
                </span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted">
                  {key === "dates"
                    ? draft.date === "all"
                      ? "All dates"
                      : "1 selected"
                    : key === "types"
                      ? draft.eventType === "all"
                        ? "All types"
                        : eventTypeChoices.find((choice) => choice.type === draft.eventType)?.label
                      : "View options"}
                </span>
              </button>
            ))}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto overscroll-contain p-3">
            {section === "dates" ? (
              <fieldset className="space-y-1">
                <legend className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Show date
                </legend>
                <FilterChoice
                  name={`${radioId}-date`}
                  label="All dates"
                  count={matchingCount("all", draft.eventType)}
                  checked={draft.date === "all"}
                  onChange={() => setDraft({ ...draft, date: "all" })}
                />
                {dates.map((date) => (
                  <FilterChoice
                    key={date.key}
                    name={`${radioId}-date`}
                    label={date.label}
                    count={matchingCount(date.key, draft.eventType)}
                    checked={draft.date === date.key}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        date: date.key,
                        collapsedDates: draft.collapsedDates.filter((key) => key !== date.key)
                      })
                    }
                  />
                ))}
              </fieldset>
            ) : section === "types" ? (
              <fieldset className="space-y-1">
                <legend className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-muted">
                  Show event type
                </legend>
                <FilterChoice
                  name={`${radioId}-type`}
                  label="All types"
                  count={matchingCount(draft.date, "all")}
                  checked={draft.eventType === "all"}
                  onChange={() => setDraft({ ...draft, eventType: "all" })}
                />
                {eventTypeChoices.map(({ type, label }) => (
                  <FilterChoice
                    key={type}
                    name={`${radioId}-type`}
                    label={label}
                    icon={<EventTypeIcon type={type} className="shrink-0" iconClassName="size-4" />}
                    count={matchingCount(draft.date, type)}
                    checked={draft.eventType === type}
                    onChange={() => setDraft({ ...draft, eventType: type })}
                  />
                ))}
              </fieldset>
            ) : (
              <div className="space-y-4">
                <fieldset className="space-y-1">
                  <legend className="mb-2 px-2 text-xs font-bold uppercase tracking-wide text-muted">
                    Date groups
                  </legend>
                  <FilterChoice
                    name={`${radioId}-groups`}
                    label="All expanded"
                    checked={dateMode(draft.collapsedDates) === "expanded"}
                    onChange={() => setDraft({ ...draft, collapsedDates: [] })}
                  />
                  <FilterChoice
                    name={`${radioId}-groups`}
                    label="All collapsed"
                    checked={dateMode(draft.collapsedDates) === "collapsed"}
                    onChange={() => setDraft({ ...draft, collapsedDates: dateKeys })}
                  />
                  {(dateMode(initial.collapsedDates) === "custom" ||
                    dateMode(draft.collapsedDates) === "custom") && (
                    <FilterChoice
                      name={`${radioId}-groups`}
                      label="My selection"
                      checked={dateMode(draft.collapsedDates) === "custom"}
                      onChange={() =>
                        setDraft({
                          ...draft,
                          collapsedDates:
                            dateMode(initial.collapsedDates) === "custom"
                              ? initial.collapsedDates
                              : draft.collapsedDates
                        })
                      }
                    />
                  )}
                </fieldset>
                <fieldset className="space-y-1 border-t border-line pt-3">
                  <legend className="px-2 text-xs font-bold uppercase tracking-wide text-muted">
                    Event details
                  </legend>
                  {activeId && (
                    <FilterChoice
                      name={`${radioId}-cards`}
                      label="Priority only"
                      checked={cardMode(draft.expanded) === "priority"}
                      onChange={() => setDraft({ ...draft, expanded: defaultExpanded })}
                    />
                  )}
                  <FilterChoice
                    name={`${radioId}-cards`}
                    label="All expanded"
                    checked={cardMode(draft.expanded) === "expanded"}
                    onChange={() => setDraft({ ...draft, expanded: entryIds, collapsedDates: [] })}
                  />
                  <FilterChoice
                    name={`${radioId}-cards`}
                    label="All collapsed"
                    checked={cardMode(draft.expanded) === "collapsed"}
                    onChange={() => setDraft({ ...draft, expanded: [] })}
                  />
                  {cardMode(initial.expanded) === "custom" && (
                    <FilterChoice
                      name={`${radioId}-cards`}
                      label="My selection"
                      checked={cardMode(draft.expanded) === "custom"}
                      onChange={() => setDraft({ ...draft, expanded: initial.expanded })}
                    />
                  )}
                </fieldset>
              </div>
            )}
          </div>
        </div>
        {(activeId || calendarAction) && (
          <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-line px-3 py-1 text-muted">
            {activeId && (
              <button
                type="button"
                className="view-option gap-2"
                onClick={() => {
                  onClose();
                  onJump(activeId);
                }}
              >
                <LocateFixed className="size-4 shrink-0" />
                {priorityLabel}
              </button>
            )}
            {calendarAction}
          </div>
        )}
        <footer className="grid shrink-0 grid-cols-[auto_1fr] items-center gap-4 border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            className="tap-target px-2 text-sm font-bold text-muted underline underline-offset-4"
            onClick={() =>
              setDraft({
                date: "all",
                eventType: "all",
                expanded: defaultExpanded,
                collapsedDates: []
              })
            }
          >
            Reset
          </button>
          <button
            type="button"
            className="primary-button justify-center !text-sm"
            onClick={() => onApply(draft)}
          >
            Apply · {count} {count === 1 ? "item" : "items"}
          </button>
        </footer>
      </section>
    </div>,
    document.body
  );
}
