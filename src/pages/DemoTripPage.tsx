import { TripTimeline, type TimelineHandle } from "../features/timeline/TripTimeline";
import { TripViewTabs } from "../features/trips/TripViewTabs";
import type { TripTimelineEntry } from "../features/timeline/model";
import { preferredScrollBehavior, scrollTimelineEventIntoView } from "../features/timeline/scroll";
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  ChevronRight,
  Download,
  MapPin,
  LocateFixed,
  Plus,
  RotateCcw,
  Search,
  UsersRound,
  WifiOff,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EventTypeIcon } from "../components/EventTypeIcon";
import { FocusSurface } from "../components/FocusSurface";
import { ModalSheet } from "../components/ModalSheet";
import { TripDocumentRow } from "../components/TripDocumentRow";
import { CompactCostTotal, CostTotals } from "../components/TripUi";
import { demoEvents, demoPhaseCopy, demoTasks, demoTravelers, documentById } from "../demo/data";
import {
  demoBookingById,
  demoBookings,
  demoEventTimes,
  demoCosts,
  demoDocumentsForTraveler,
  demoTravelersAsTravelers
} from "../demo/model";
import type { DemoEvent, DemoPhase, DemoTask } from "../demo/types";
import { ReservationRow } from "../features/trips/TripDetailsCards";
import { TripDetailsSection } from "../features/trips/TripDetailsSection";
import { ReadinessProgress, TripReadinessSection } from "../features/trips/TripReadinessSummary";
import { CostDetailsSheet, TripExpensesSheet } from "../features/trips/TripExpenses";
import { calculateTripBalances } from "../features/trips/expenses";
import type { TimelineEventType, TripCost } from "../features/trips/types";
import { database } from "../lib/local-db/database";
import { DocumentTypeIcon } from "../components/DocumentTypeIcon";
import { BookingHeroSurface } from "../components/BookingHeroSurface";
import { BookingSummarySurface } from "../components/BookingSummarySurface";
import { FlightSeatsEditor } from "../components/FlightSeatsEditor";
import { DocumentCardContent, documentCardLinkClassName } from "../components/DocumentCardContent";
import { DemoDocumentPreview } from "../demo/DemoDocumentPreview";
import { demoVaultDocumentById } from "../demo/model";
import { travelerGroup } from "../features/workspace/documentModel";
import { BookingDisclosure } from "../features/workspace/BookingDetailSections";
import { formatMoney } from "../features/trips/presentation";
import { CollectionCounts } from "../features/trips/CollectionCounts";
import {
  bookingCategoryCounts,
  matchesReservationFilter,
  type ReservationFilter
} from "../features/trips/reservationPresentation";
import {
  documentCategoryCounts,
  documentFilterCategory
} from "../features/workspace/documentFilters";

const phases: DemoPhase[] = ["planning", "predeparture", "travelday", "intrip", "completed"];
type DemoView = "timeline" | "details";
type DemoSheet = "people" | "readiness" | "expenses" | null;

function demoTimelineEventType(type: DemoEvent["type"]): TimelineEventType {
  return type === "hotel" ? "hotel_check_in" : type;
}

function DemoDocumentLink({
  documentId,
  onView
}: {
  documentId: string;
  onView: (id: string) => void;
}) {
  const document = demoVaultDocumentById.get(documentId);
  if (!document) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface/70">
      <button
        type="button"
        className={documentCardLinkClassName}
        onClick={() => onView(documentId)}
        aria-label={document.title}
      >
        <DocumentCardContent document={document} />
      </button>
    </div>
  );
}

function EventDetails({
  event,
  visibleDocumentIds,
  focusedTravelerId,
  onViewDocument,
  onViewCost,
  seats,
  onSaveSeat,
  onClose
}: {
  event: DemoEvent;
  visibleDocumentIds: Set<string>;
  focusedTravelerId: string | null;
  onViewDocument: (id: string) => void;
  onViewCost: (cost: TripCost) => void;
  seats: Record<string, string>;
  onSaveSeat: (travelerId: string, seat: string) => void;
  onClose: () => void;
}) {
  const [seatsOpen, setSeatsOpen] = useState(false);
  const [seatMessage, setSeatMessage] = useState("");
  const documents = event.documentIds
    .filter((id) => visibleDocumentIds.has(id))
    .flatMap((id) => {
      const document = documentById.get(id);
      return document ? [document] : [];
    });
  const travelers = demoTravelers.filter(
    (traveler) =>
      event.travelerIds.includes(traveler.id) &&
      (!focusedTravelerId || traveler.id === focusedTravelerId)
  );
  const booking = demoBookingById.get(event.id);
  const documentGroups = new Map<string, ReturnType<typeof travelerGroup> & { ids: string[] }>();
  for (const document of documents) {
    const group = travelerGroup(demoVaultDocumentById.get(document.id)!, demoTravelersAsTravelers);
    const entry = documentGroups.get(group.key) ?? { ...group, ids: [] };
    entry.ids.push(document.id);
    documentGroups.set(group.key, entry);
  }
  const costs = demoCosts.filter((cost) => cost.booking_id === booking?.id);
  return (
    <ModalSheet
      eyebrow={event.type === "hotel" ? "Hotel" : event.type}
      title={event.title}
      onClose={onClose}
    >
      <div className="mt-3">
        <BookingHeroSurface type={demoTimelineEventType(event.type)}>
          <p className="text-xs font-bold uppercase tracking-wide">
            {booking?.reservation_state ?? "Planned"} · Sample
          </p>
          <h3 className="mt-2 font-display text-2xl font-black">
            {event.type === "flight" ? "DEL → FCO" : event.title}
          </h3>
          <p className="mt-1 text-sm text-white/85">{event.eyebrow}</p>
          <p className="mt-3 text-sm font-bold">
            {event.dayLabel}, {event.dateLabel} · {event.timeLabel}
          </p>
          {event.endTimeLabel && <p className="mt-1 text-xs">Ends {event.endTimeLabel}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {documents[0] && (
              <button
                type="button"
                className="hero-action hero-shortcut"
                aria-label="View document"
                onClick={() => onViewDocument(documents[0].id)}
              >
                <DocumentTypeIcon type={documents[0].category} size="sm" variant="monochrome" />
                <span className="hidden md:inline">View document</span>
              </button>
            )}
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
              target="_blank"
              rel="noreferrer"
              className="hero-action hero-shortcut hero-shortcut--label"
            >
              <LocateFixed className="size-4" /> Navigate
            </a>
          </div>
        </BookingHeroSurface>
      </div>
      <p className="mt-4 flex items-start gap-2 text-sm text-muted">
        <MapPin className="mt-0.5 size-4 shrink-0" />
        {event.location}
      </p>
      <p className="mt-4 whitespace-pre-wrap rounded-xl bg-elevated p-3 text-sm leading-6 text-muted">
        {event.note}
      </p>
      {booking ? (
        <div className="mt-3">
          <BookingSummarySurface
            booking={booking}
            eventType={demoTimelineEventType(event.type)}
            route={event.type === "flight" ? "DEL → FCO" : undefined}
          />
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-4">
          <p className="text-sm font-extrabold">Planned without a booking</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            A booking can be attached later without recreating this timeline event.
          </p>
        </div>
      )}
      {event.type === "flight" && (
        <FlightSeatsEditor
          route="DEL → FCO"
          travelers={demoTravelersAsTravelers.filter((traveler) =>
            travelers.some((person) => person.id === traveler.id)
          )}
          seats={Object.entries(seats).map(([traveler_id, seat]) => ({ traveler_id, seat }))}
          open={seatsOpen}
          onOpenChange={setSeatsOpen}
          message={seatMessage}
          onSave={(travelerId, seat) => {
            onSaveSeat(travelerId, seat);
            setSeatMessage("Demo seat saved for this preview. No real booking was changed.");
          }}
        />
      )}
      <div className="mt-4 border-t border-line pt-3">
        <h3 className="text-sm font-bold">
          Documents <span className="ml-1 text-muted">{documents.length}</span>
        </h3>
        <div className="mt-2 space-y-2">
          {documents.length ? (
            [...documentGroups.values()]
              .sort((a, b) => a.order - b.order)
              .map((group) => (
                <details
                  key={`${focusedTravelerId ?? "all"}:${group.key}`}
                  open={
                    documentGroups.size === 1 ||
                    Boolean(focusedTravelerId) ||
                    group.key === "shared"
                  }
                  className="group"
                >
                  <summary className="min-h-10 cursor-pointer py-2 text-xs font-bold text-muted">
                    For {group.label} · {group.ids.length}
                  </summary>
                  <div className="space-y-1.5">
                    {group.ids.map((id) => (
                      <DemoDocumentLink key={id} documentId={id} onView={onViewDocument} />
                    ))}
                  </div>
                </details>
              ))
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
              No documents attached to this event.
            </p>
          )}
        </div>
      </div>
      {costs.length > 0 && (
        <div className="mt-3">
          <BookingDisclosure
            title="Costs"
            compact
            hint={costs
              .map((cost) => formatMoney(cost.amount_minor, cost.currency_code))
              .join(" · ")}
          >
            <div className="space-y-2">
              {costs.map((cost) => (
                <button
                  key={cost.id}
                  type="button"
                  className="expense-list-item flex min-h-11 w-full items-center gap-2 rounded-xl p-3 text-left text-sm"
                  onClick={() => onViewCost(cost)}
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block break-words">{cost.title}</strong>
                    <span className="text-xs capitalize text-muted">{cost.payment_status}</span>
                  </span>
                  <strong>{formatMoney(cost.amount_minor, cost.currency_code)}</strong>
                  <ChevronRight className="size-4" />
                </button>
              ))}
            </div>
          </BookingDisclosure>
        </div>
      )}
      <Link
        className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-brand"
        to="/sign-in"
      >
        <Plus className="size-4" /> Sign in to add
      </Link>
      <div className="mt-6 border-t border-line pt-5">
        <p className="eyebrow">Travelers</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {travelers.map((traveler) => (
            <span
              key={traveler.id}
              className="rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand"
            >
              {traveler.name}
            </span>
          ))}
        </div>
      </div>
    </ModalSheet>
  );
}

function PeopleSheet({
  selectedId,
  onSelect,
  onClose
}: {
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const choose = (id: string | null) => {
    onSelect(id);
    onClose();
  };
  return (
    <ModalSheet eyebrow="Mediterranean Summer" title="People & sharing" onClose={onClose}>
      <p className="mt-2 text-xs text-muted">Choose whose plans and documents to show.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => choose(null)}
          aria-pressed={selectedId === null}
          className={`flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-2 py-2 text-left ${selectedId === null ? "border-brand bg-brand-soft" : "border-line"}`}
        >
          <UsersRound className="size-5 shrink-0 text-brand" />
          <strong className="text-sm">Everyone</strong>
        </button>
        {demoTravelers
          .filter((traveler) => traveler.role !== "Non-travelling collaborator")
          .map((traveler) => (
            <button
              key={traveler.id}
              type="button"
              onClick={() => choose(traveler.id)}
              aria-label={`Show ${traveler.name}'s trip information`}
              aria-pressed={selectedId === traveler.id}
              title={traveler.name}
              className={`flex min-h-14 min-w-0 items-center gap-2 rounded-xl border px-2 py-2 text-left ${selectedId === traveler.id ? "border-brand bg-brand-soft" : "border-line"}`}
            >
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full text-[.6rem] font-black text-white sm:size-7"
                style={{ background: traveler.color }}
              >
                {traveler.initials}
              </span>
              <span className="min-w-0">
                <strong className="block truncate text-[13px] sm:text-sm">{traveler.name}</strong>
                <span className="block truncate text-[10px] text-muted">{traveler.role}</span>
              </span>
            </button>
          ))}
      </div>
      <Link to="/sign-in" className="primary-button mt-5 w-full">
        <UsersRound className="size-4" /> Sign in to share a real trip
      </Link>
    </ModalSheet>
  );
}

function ReadinessSheet({
  tasks,
  statuses,
  onStatus,
  onClose
}: {
  tasks: DemoTask[];
  statuses: Record<string, "to_check" | "complete">;
  onStatus: (id: string, complete: boolean) => void;
  onClose: () => void;
}) {
  const done = tasks.filter((task) => statuses[task.id] === "complete").length;
  return (
    <ModalSheet eyebrow="Mediterranean Summer" title="Tasks & readiness" onClose={onClose}>
      <p className="mt-3 text-sm text-muted">
        {done} of {tasks.length} tasks done
      </p>
      <div className="mt-5 space-y-2">
        {tasks.map((task) => {
          const complete = statuses[task.id] === "complete";
          return (
            <label
              key={task.id}
              className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-elevated p-4"
            >
              <input
                type="checkbox"
                checked={complete}
                onChange={(event) => onStatus(task.id, event.target.checked)}
                className="mt-0.5 size-5 accent-brand"
              />
              <span>
                <strong className={`block text-sm ${complete ? "text-muted line-through" : ""}`}>
                  {task.title}
                </strong>
                <span className="mt-1 block text-xs text-muted">{task.scheduleLabel}</span>
              </span>
            </label>
          );
        })}
      </div>
      <Link to="/sign-in" className="secondary-button mt-5 w-full">
        <Plus className="size-4" /> Sign in to add a task
      </Link>
    </ModalSheet>
  );
}

export function DemoTripPage() {
  const [reservationFilter, setReservationFilter] = useState<ReservationFilter>("all");
  const [documentFilter, setDocumentFilter] = useState("all");
  const [phase, setPhase] = useState<DemoPhase>("travelday");
  const [view, setView] = useState<DemoView>("timeline");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<DemoEvent | null>(null);
  const [demoSeats, setDemoSeats] = useState<Record<string, Record<string, string>>>({});
  const [selectedCost, setSelectedCost] = useState<TripCost | null>(null);
  const [sheet, setSheet] = useState<DemoSheet>(null);
  const [selectedTask, setSelectedTask] = useState<DemoTask | null>(null);
  const [focusedTravelerId, setFocusedTravelerId] = useState<string | null>(null);
  useEffect(() => {
    setReservationFilter("all");
    setDocumentFilter("all");
  }, [focusedTravelerId]);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, "to_check" | "complete">>(() =>
    Object.fromEntries(demoTasks.map((task) => [task.id, task.status]))
  );
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const copy = demoPhaseCopy[phase];
  const visibleEvents = useMemo(
    () =>
      focusedTravelerId
        ? demoEvents.filter((event) => event.travelerIds.includes(focusedTravelerId))
        : demoEvents,
    [focusedTravelerId]
  );
  const visibleTasks = useMemo(
    () =>
      focusedTravelerId
        ? demoTasks.filter(
            (task) => task.travelerIds.length === 0 || task.travelerIds.includes(focusedTravelerId)
          )
        : demoTasks,
    [focusedTravelerId]
  );
  const visibleDocuments = useMemo(
    () => demoDocumentsForTraveler(focusedTravelerId),
    [focusedTravelerId]
  );
  const visibleDocumentIds = useMemo(
    () => new Set(visibleDocuments.map((document) => document.id)),
    [visibleDocuments]
  );
  const visibleCosts = useMemo(
    () =>
      focusedTravelerId
        ? demoCosts.filter((cost) =>
            cost.participants?.some((participant) => participant.traveler_id === focusedTravelerId)
          )
        : demoCosts,
    [focusedTravelerId]
  );
  const visibleBalances = useMemo(
    () =>
      calculateTripBalances(visibleCosts).filter(
        (balance) => !focusedTravelerId || balance.travelerId === focusedTravelerId
      ),
    [focusedTravelerId, visibleCosts]
  );
  const visibleReservations = useMemo(
    () => visibleEvents.filter((event) => demoBookingById.has(event.id)),
    [visibleEvents]
  );
  const activeEvent =
    visibleEvents.find((event) => event.id === copy.activeEventId) ?? visibleEvents[0];
  const focusedTraveler = focusedTravelerId
    ? demoTravelers.find((traveler) => traveler.id === focusedTravelerId)
    : undefined;
  const completedTasks = visibleTasks.filter((task) => taskStatuses[task.id] === "complete").length;

  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return [];
    const needle = query.toLowerCase();
    return [
      ...visibleEvents
        .filter((event) =>
          `${event.title} ${event.eyebrow} ${event.location}`.toLowerCase().includes(needle)
        )
        .map((event) => ({
          id: event.id,
          title: event.title,
          detail: `${event.type} · ${event.location}`,
          type: "event" as const
        })),
      ...visibleDocuments
        .filter((document) =>
          `${document.title} ${document.purpose}`.toLowerCase().includes(needle)
        )
        .map((document) => ({
          id: document.id,
          title: document.title,
          detail: `Document · ${document.purpose}`,
          type: "document" as const
        })),
      ...visibleTasks
        .filter((task) => task.title.toLowerCase().includes(needle))
        .map((task) => ({
          id: task.id,
          title: task.title,
          detail: `Readiness · ${task.scheduleLabel}`,
          type: "task" as const
        })),
      ...demoTravelers
        .filter((traveler) => traveler.role !== "Non-travelling collaborator")
        .filter((traveler) => traveler.name.toLowerCase().includes(needle))
        .map((traveler) => ({
          id: traveler.id,
          title: traveler.name,
          detail: `Traveler · ${traveler.role}`,
          type: "traveler" as const
        }))
    ];
  }, [query, visibleDocuments, visibleEvents, visibleTasks]);

  useEffect(() => {
    database.settings
      .get("demo-phase")
      .then((setting) => {
        if (setting && phases.includes(setting.value as DemoPhase))
          setPhase(setting.value as DemoPhase);
      })
      .catch(() => undefined);
  }, []);

  const choosePhase = (next: DemoPhase) => {
    setPhase(next);
    database.settings
      .put({ key: "demo-phase", value: next, updatedAt: new Date().toISOString() })
      .catch(() => undefined);
  };
  const resetDemo = () => {
    setDemoSeats({});
    choosePhase("travelday");
    setView("timeline");
    setFocusedTravelerId(null);
    setQuery("");
    setSelectedEvent(null);
    setSelectedCost(null);
    setSheet(null);
    setTaskStatuses(Object.fromEntries(demoTasks.map((task) => [task.id, task.status])));
  };
  const scrollToEvent = (id: string) => {
    setView("timeline");
    setQuery("");
    window.requestAnimationFrame(() => {
      timelineRef.current?.reveal(id);
      window.requestAnimationFrame(() =>
        scrollTimelineEventIntoView(id, preferredScrollBehavior())
      );
    });
  };
  const demoTimeline: TripTimelineEntry[] = visibleEvents.flatMap((event) => {
    const booking = demoBookingById.get(event.id);
    const item = {
      id: event.id,
      trip_id: "demo-trip",
      booking_id: booking?.id ?? null,
      title: event.title,
      event_type: demoTimelineEventType(event.type),
      starts_at: demoEventTimes[event.id].start,
      ends_at: demoEventTimes[event.id].end ?? null,
      timezone: "Europe/Rome",
      location: { label: event.location },
      notes: event.note,
      applies_to_all_travelers: true,
      created_at: "2026-01-01T00:00:00Z"
    };
    const tasks: TripTimelineEntry[] = visibleTasks
      .filter((task) => task.anchorEventId === event.id)
      .map((task) => ({
        kind: "event",
        id: `task-${task.id}`,
        startsAt: item.starts_at,
        timezone: item.timezone,
        item: {
          ...item,
          id: `task-${task.id}`,
          title: task.title,
          event_type: "preparation",
          timing_mode: "relative",
          anchor_itinerary_item_id: event.id,
          relative_position: "before",
          location: null
        }
      }));
    return [
      ...tasks,
      {
        kind: "event" as const,
        id: item.id,
        startsAt: item.starts_at,
        timezone: item.timezone,
        item
      }
    ];
  });
  const handleSearchResult = (result: (typeof searchResults)[number]) => {
    if (result.type === "event") {
      scrollToEvent(result.id);
      setQuery("");
    }
    if (result.type === "task") {
      setQuery("");
      scrollToEvent(`task-${result.id}`);
    }
    if (result.type === "traveler") {
      setFocusedTravelerId(result.id);
      setQuery("");
    }
  };

  return (
    <AppShell
      demo
      onTripSearch={() => {
        setView("timeline");
        window.requestAnimationFrame(() => {
          document
            .getElementById("trip-search")
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
          searchInputRef.current?.focus({ preventScroll: true });
        });
      }}
    >
      <div className="mx-auto max-w-6xl pb-24">
        <Link
          to="/welcome"
          className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" /> Back to welcome
        </Link>

        <section
          className="mt-4 rounded-2xl border border-line bg-surface p-3 shadow-soft"
          aria-label="Demo controls"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Safe demo controls</p>
              <p className="mt-1 text-xs text-muted">
                Change the sample clock to preview the same trip in different states.
              </p>
            </div>
            <button
              type="button"
              onClick={resetDemo}
              className="secondary-button min-h-9 px-3 py-2 text-xs"
            >
              <RotateCcw className="size-3.5" /> Reset demo
            </button>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {phases.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => choosePhase(item)}
                aria-pressed={phase === item}
                className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black capitalize ${phase === item ? "bg-brand text-surface" : "bg-elevated text-muted"}`}
              >
                {item === "predeparture" ? "D-1" : item === "travelday" ? "Travel day" : item}
              </button>
            ))}
          </div>
        </section>

        <header className="trip-hero page-enter mt-4 rounded-3xl bg-brand p-5 text-surface shadow-focus sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold leading-relaxed text-surface/80 sm:text-sm">
                Thu, 18 Jun – Sat, 27 Jun 2026
              </p>
              <h1 className="mt-2 font-display text-3xl font-black tracking-[-.05em] sm:text-4xl">
                Mediterranean Summer
              </h1>
              <p className="mt-2 flex items-center gap-2 text-sm text-surface/80">
                <MapPin className="size-4" />
                Rome, Florence, Venice & Milan
              </p>
            </div>
            <span className="rounded-full bg-surface/10 px-3 py-2 text-xs font-bold">
              Safe demo
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSheet("expenses")}
            className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl bg-surface/10 px-3 py-2 text-left transition hover:bg-surface/15"
            aria-label="Open trip expenses"
          >
            <CompactCostTotal costs={visibleCosts} emptyText="Add your first trip cost" inverse />
            <ChevronRight className="size-4 shrink-0 text-surface/60" />
          </button>
        </header>

        <TripViewTabs view={view} onChange={setView} />
        {view === "timeline" && (
          <div
            id="trip-search"
            role="search"
            aria-label="Search within this trip"
            className="relative mt-3 scroll-mt-[10rem]"
          >
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="form-input mt-0 min-h-12 pl-12 pr-11 text-base"
              placeholder="Search timeline, booking, document, traveler…"
              aria-label="Search this trip"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1.5 grid size-9 place-items-center text-muted"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
            {query.length >= 2 && (
              <div className="relative z-40 mt-2 max-h-[42dvh] w-full overflow-auto rounded-2xl border border-line bg-surface p-2 shadow-focus sm:absolute sm:max-h-96">
                {searchResults.map((result) =>
                  result.type === "document" ? (
                    <a
                      key={`${result.type}:${result.id}`}
                      href={documentById.get(result.id)?.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setQuery("")}
                      className="block rounded-xl px-3 py-3 hover:bg-elevated"
                    >
                      <strong className="block text-sm">{result.title}</strong>
                      <span className="text-xs text-muted">{result.detail}</span>
                    </a>
                  ) : (
                    <button
                      key={`${result.type}:${result.id}`}
                      type="button"
                      onClick={() => handleSearchResult(result)}
                      className="block w-full rounded-xl px-3 py-3 text-left hover:bg-elevated"
                    >
                      <strong className="block text-sm">{result.title}</strong>
                      <span className="text-xs text-muted">{result.detail}</span>
                    </button>
                  )
                )}
                {searchResults.length === 0 && (
                  <p className="p-4 text-sm text-muted">Nothing in this trip matches.</p>
                )}
              </div>
            )}
          </div>
        )}
        {view === "timeline" ? (
          <main className="mt-5">
            <button
              type="button"
              onClick={() => setSheet("readiness")}
              className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:border-brand/40"
            >
              <ReadinessProgress resolved={completedTasks} total={visibleTasks.length} />
              <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted" />
            </button>

            <section className="-mx-2 mt-4 min-w-0 sm:surface-card sm:mx-0 sm:p-6">
              <div className="mb-3 rounded-xl bg-brand-soft p-3 text-xs font-bold text-brand">
                <strong>{copy.label}:</strong> {copy.sublabel}
              </div>
              <div>
                <TripTimeline
                  title={
                    focusedTraveler ? `${focusedTraveler.name}'s timeline` : "Complete timeline"
                  }
                  calendarAction={
                    <a
                      className="view-option gap-2"
                      href="data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR%0AEND%3AVCALENDAR"
                      download="mediterranean-summer.ics"
                    >
                      <Download className="size-4" /> Calendar
                    </a>
                  }
                  key={`${phase}:${focusedTravelerId ?? "everyone"}`}
                  ref={timelineRef}
                  entries={demoTimeline}
                  activeId={phase === "completed" ? undefined : activeEvent?.id}
                  activeCaption={phase === "intrip" ? "Now" : "Next"}
                  storageKey={`trip-vault:demo-timeline:${phase}:${focusedTravelerId ?? "everyone"}`}
                  onJump={scrollToEvent}
                  taskControl={(entry) => {
                    const task = visibleTasks.find((task) => `task-${task.id}` === entry.id);
                    if (!task) return;
                    return {
                      checked: taskStatuses[task.id] === "complete",
                      onToggle: (checked) =>
                        setTaskStatuses((statuses) => ({
                          ...statuses,
                          [task.id]: checked ? "complete" : "to_check"
                        })),
                      onOpen: () => {
                        setSelectedTask(task);
                        setSheet("readiness");
                      }
                    };
                  }}
                  renderDetail={(entry) => {
                    const event = visibleEvents.find((event) => event.id === entry.id)!;
                    return (
                      <div>
                        {event.endTimeLabel && (
                          <p className="text-sm text-muted">
                            {event.type === "flight" || event.type === "train" ? "Arrives" : "Ends"}{" "}
                            {event.endTimeLabel}
                          </p>
                        )}
                        <p className="mt-2 text-sm text-muted">{event.note}</p>
                        {demoBookingById.has(event.id) && (
                          <div className="mt-3">
                            <BookingSummarySurface
                              booking={demoBookingById.get(event.id)!}
                              eventType={demoTimelineEventType(event.type)}
                              route={event.type === "flight" ? "DEL → FCO" : undefined}
                            />
                          </div>
                        )}
                        {event.documentIds.find((id) => visibleDocumentIds.has(id)) && (
                          <button
                            type="button"
                            className="relative z-20 mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-extrabold text-brand"
                            onClick={() =>
                              setSelectedDocumentId(
                                event.documentIds.find((id) => visibleDocumentIds.has(id))!
                              )
                            }
                          >
                            <DocumentTypeIcon
                              type={
                                documentById.get(
                                  event.documentIds.find((id) => visibleDocumentIds.has(id))!
                                )!.category
                              }
                              size="sm"
                            />{" "}
                            View document
                          </button>
                        )}
                        <button
                          type="button"
                          className="absolute inset-0 z-10 w-full rounded-b-2xl focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                          aria-label={`Open details for ${event.title}`}
                          onClick={() => setSelectedEvent(event)}
                        />
                        <span
                          aria-hidden="true"
                          className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-brand"
                        >
                          View details <ChevronRight className="size-3.5" />
                        </span>
                      </div>
                    );
                  }}
                />
              </div>
            </section>
          </main>
        ) : (
          <main className="mt-5 space-y-5">
            <nav className="flex gap-2 overflow-auto pb-1">
              {[
                ["readiness", "Readiness"],
                ["reservations", "Reservations"],
                ["costs", "Costs"],
                ["people", "People"],
                ["documents", "Documents"],
                ["offline", "Offline"],
                ["notes", "Notes"]
              ].map(([id, label]) => (
                <a
                  className="shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold"
                  key={id}
                  href={`#demo-${id}`}
                >
                  {label}
                </a>
              ))}
            </nav>
            <TripReadinessSection
              id="demo-readiness"
              resolved={completedTasks}
              total={visibleTasks.length}
              onOpen={() => setSheet("readiness")}
            />
            <TripDetailsSection
              id="demo-reservations"
              eyebrow="Bookings"
              title={focusedTraveler ? `${focusedTraveler.name}'s reservations` : "Reservations"}
              count={visibleReservations.length}
              action={
                <Link to="/sign-in" className="secondary-button">
                  <Plus className="size-4" /> Add
                </Link>
              }
            >
              <div className="space-y-2">
                <CollectionCounts
                  selectedKey={reservationFilter}
                  onSelect={(key) => setReservationFilter(key as ReservationFilter)}
                  values={[
                    { key: "all", label: "All", count: visibleReservations.length },
                    ...bookingCategoryCounts(
                      visibleReservations.flatMap((event) => {
                        const booking = demoBookingById.get(event.id);
                        return booking ? [booking] : [];
                      })
                    )
                  ]}
                />
                {visibleReservations
                  .filter((event) =>
                    matchesReservationFilter(
                      demoBookingById.get(event.id)?.type ?? "other",
                      reservationFilter
                    )
                  )
                  .map((event) => {
                    const booking = demoBookingById.get(event.id);
                    return booking ? (
                      <ReservationRow
                        key={event.id}
                        booking={booking}
                        route={event.location.replace(" -> ", " → ")}
                        documentCount={
                          event.documentIds.filter((id) => visibleDocumentIds.has(id)).length
                        }
                        onClick={() => setSelectedEvent(event)}
                      />
                    ) : null;
                  })}
              </div>
            </TripDetailsSection>
            <TripDetailsSection
              id="demo-costs"
              eyebrow="Money"
              title={focusedTraveler ? `${focusedTraveler.name}'s trip costs` : "Trip expenses"}
              count={visibleCosts.length}
              onActivate={() => setSheet("expenses")}
              activateLabel="Open itemized trip expenses"
              action={
                <Link to="/sign-in" className="secondary-button">
                  <Plus className="size-4" /> Add
                </Link>
              }
            >
              <CostTotals costs={visibleCosts} />
              <span className="mt-3 flex items-center justify-end gap-1 text-xs font-extrabold text-brand">
                View itemized expenses <ChevronRight className="size-4" />
              </span>
            </TripDetailsSection>
            <TripDetailsSection
              id="demo-people"
              eyebrow="People & sharing"
              title={focusedTraveler?.name ?? "Everyone"}
              onActivate={() => setSheet("people")}
              action={
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setSheet("people")}
                >
                  <UsersRound className="size-4" /> Open
                </button>
              }
            >
              <p className="text-sm text-muted">
                Switch between the complete trip and one person's relevant timeline, reservations,
                readiness, and documents.
              </p>
            </TripDetailsSection>
            <TripDetailsSection
              id="demo-documents"
              eyebrow="Vault"
              title="Documents"
              count={visibleDocuments.length}
              action={
                <Link to="/sign-in" className="secondary-button">
                  <Plus className="size-4" /> Upload
                </Link>
              }
            >
              <p className="text-sm text-muted">
                {visibleDocuments.length} sample document
                {visibleDocuments.length === 1 ? "" : "s"}
                {focusedTraveler ? ` for ${focusedTraveler.name}` : " in this trip"}
              </p>
              <div className="mt-3 space-y-2">
                <CollectionCounts
                  selectedKey={documentFilter}
                  onSelect={setDocumentFilter}
                  values={[
                    { key: "all", label: "All", count: visibleDocuments.length },
                    ...documentCategoryCounts(visibleDocuments, demoBookings)
                  ]}
                />
                {visibleDocuments
                  .filter(
                    (document) =>
                      documentFilter === "all" ||
                      documentFilterCategory(document, demoBookings) === documentFilter
                  )
                  .map((document) => (
                    <TripDocumentRow
                      key={document.id}
                      document={document}
                      travelers={demoTravelersAsTravelers}
                      context="Available offline"
                      onClick={() => {
                        setSelectedDocumentId(document.id);
                      }}
                    />
                  ))}
              </div>
            </TripDetailsSection>
            <TripDetailsSection id="demo-offline" eyebrow="On this device" title="Offline pack">
              <div className="flex items-start gap-3 rounded-xl bg-success/10 p-4">
                <WifiOff className="mt-0.5 size-5 text-success" />
                <div>
                  <p className="font-bold">Available offline</p>
                  <p className="mt-1 text-sm text-muted">
                    This synthetic trip and its watermarked documents are bundled with the app.
                  </p>
                </div>
              </div>
            </TripDetailsSection>
            <TripDetailsSection
              id="demo-notes"
              eyebrow="Useful details"
              title="Notes"
              contentClassName="mt-2"
            >
              <div className="min-h-14 rounded-xl bg-elevated px-3 py-2">
                <p className="text-sm font-bold leading-5">Arrival plan</p>
                <p className="mt-0.5 text-sm leading-5 text-muted">
                  Mia has the apartment access instructions. Sam will arrange the airport transfer.
                </p>
              </div>
            </TripDetailsSection>
          </main>
        )}

        <div
          data-trip-actions
          className="fixed bottom-[calc(var(--app-footer-height)+0.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex w-max max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-soft backdrop-blur lg:bottom-6"
        >
          <Link
            to="/sign-in"
            className="primary-button h-11 min-h-11 shrink-0 gap-2 whitespace-nowrap rounded-xl px-3 py-0 text-sm sm:px-4"
            aria-label="Sign in to add event"
          >
            <CalendarPlus className="size-4" />
            <span>Add event</span>
          </Link>
          <button
            type="button"
            onClick={() => setSheet("people")}
            className="secondary-button h-11 min-h-11 min-w-0 justify-center gap-1.5 rounded-xl px-2 py-0 text-xs sm:px-2.5"
            aria-label={`People and sharing · ${focusedTraveler?.name ?? "Everyone"}`}
            title={`People and sharing · ${focusedTraveler?.name ?? "Everyone"}`}
          >
            {focusedTraveler ? (
              <span className="grid size-6 place-items-center rounded-full bg-brand text-[.55rem] font-black text-surface">
                {focusedTraveler.initials}
              </span>
            ) : (
              <UsersRound className="size-5" aria-hidden="true" />
            )}
            <span className="max-w-20 truncate">{focusedTraveler?.name ?? "Everyone"}</span>
          </button>
          <button
            type="button"
            onClick={() => activeEvent && scrollToEvent(activeEvent.id)}
            disabled={!activeEvent || phase === "completed"}
            aria-label="Jump to current or next"
            title="Jump to current or next"
            className="tap-target grid size-11 shrink-0 place-items-center rounded-xl border border-line text-brand hover:bg-brand-soft disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LocateFixed aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      {selectedDocumentId && (
        <DemoDocumentPreview
          key={selectedDocumentId}
          documentId={selectedDocumentId}
          onClose={() => setSelectedDocumentId(null)}
        />
      )}
      {selectedEvent && !selectedDocumentId && !selectedCost && (
        <EventDetails
          event={selectedEvent}
          onViewDocument={setSelectedDocumentId}
          onViewCost={setSelectedCost}
          visibleDocumentIds={visibleDocumentIds}
          focusedTravelerId={focusedTravelerId}
          seats={demoSeats[selectedEvent.id] ?? {}}
          onSaveSeat={(travelerId, seat) =>
            setDemoSeats((current) => ({
              ...current,
              [selectedEvent.id]: { ...current[selectedEvent.id], [travelerId]: seat }
            }))
          }
          onClose={() => setSelectedEvent(null)}
        />
      )}
      {sheet === "people" && (
        <PeopleSheet
          selectedId={focusedTravelerId}
          onSelect={setFocusedTravelerId}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "readiness" && (
        <ReadinessSheet
          tasks={selectedTask ? [selectedTask] : visibleTasks}
          statuses={taskStatuses}
          onStatus={(id, complete) =>
            setTaskStatuses((statuses) => ({
              ...statuses,
              [id]: complete ? "complete" : "to_check"
            }))
          }
          onClose={() => {
            setSelectedTask(null);
            setSheet(null);
          }}
        />
      )}
      {sheet === "expenses" && (
        <TripExpensesSheet
          title={focusedTraveler ? `${focusedTraveler.name}'s trip expenses` : "Trip expenses"}
          costs={visibleCosts}
          balances={visibleBalances}
          travelers={demoTravelersAsTravelers}
          onClose={() => setSheet(null)}
          onViewCost={(cost) => {
            setSheet(null);
            setSelectedCost(cost);
          }}
        />
      )}
      {selectedCost && (
        <CostDetailsSheet
          cost={selectedCost}
          expenseSplittingEnabled
          onViewLinkedEvent={() => {
            const event = demoEvents.find((event) => event.id === selectedCost.booking_id);
            if (!event) return;
            setSelectedCost(null);
            setSheet(null);
            setSelectedEvent(event);
          }}
          travelers={demoTravelersAsTravelers}
          itinerary={[]}
          bookings={demoBookings}
          editable={false}
          onClose={() => {
            setSelectedCost(null);
            if (!selectedEvent) setSheet("expenses");
          }}
          onEdit={() => undefined}
          onArchive={() => undefined}
        />
      )}
    </AppShell>
  );
}
