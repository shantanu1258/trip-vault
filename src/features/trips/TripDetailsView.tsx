import { ChevronRight, Plus, RotateCcw, Settings, UsersRound } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { EventTypeIcon } from "../../components/EventTypeIcon";
import { ProgressiveList } from "../../components/ProgressiveList";
import { TripDocumentRow } from "../../components/TripDocumentRow";
import { CostTotals } from "../../components/TripUi";
import { rankDocumentsForUpcomingEvents } from "../home/needNow";
import { OfflinePackControl } from "../readiness/OfflinePackControl";
import { formatDateRange, formatEventTime } from "./presentation";
import { tripIntentNavigationState } from "./navigation";
import { NoteCard, ReservationRow } from "./TripDetailsCards";
import { TripDetailsSection } from "./TripDetailsSection";
import { TripAirlinesPanel } from "../workspace/TripAirlinesPanel";
import {
  bookingCategoryCounts,
  groupByBookingId,
  reservationHref,
  reservationRoute
} from "./reservationPresentation";
import type { ArchivedTripItem, ItineraryItem, Trip, TripCost } from "./types";
import type { EventDocumentReference } from "../workspace/tripRelationships";
import type {
  Booking,
  FlightLeg,
  JourneyLeg,
  Traveler,
  TripNote,
  VaultDocument
} from "../workspace/types";

type ReadinessSummary = { resolved: number; total: number };

type TripDetailsViewProps = {
  trip: Trip;
  focusedTraveler?: Traveler;
  focusedTravelerId: string | null;
  travelers: Traveler[];
  bookings: Booking[];
  flights: FlightLeg[];
  journeys: JourneyLeg[];
  costs: TripCost[];
  documents: VaultDocument[];
  itinerary: ItineraryItem[];
  eventDocumentReferences?: EventDocumentReference[];
  readiness: ReadinessSummary;
  archivedItems?: ArchivedTripItem[];
  notes?: TripNote[];
  editable: boolean;
  isOwner: boolean;
  restorePending: boolean;
  navigationState?: unknown;
  online: boolean;
  onOpenSettings: () => void;
  onAddEvent: () => void;
  onOpenExpenses: () => void;
  onAddCost: () => void;
  onOpenPeople: (trigger: HTMLButtonElement) => void;
  onOpenReadiness: () => void;
  onUploadDocument: () => void;
  onRestoreArchived: (item: ArchivedTripItem) => void;
  onAddNote: () => void;
  onEditNote: (note: TripNote) => void;
  onArchiveNote: (note: TripNote) => void;
};

function CollectionCounts({ values }: { values: Array<{ label: string; count: number }> }) {
  const visible = values.filter((value) => value.count > 0);
  if (!visible.length) return null;

  return (
    <div className="mb-4 flex flex-wrap gap-2" aria-label="Section summary">
      {visible.map((value) => (
        <span
          key={value.label}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted"
        >
          {value.label} <strong className="text-ink">{value.count}</strong>
        </span>
      ))}
    </div>
  );
}

function documentCategoryCounts(documents: VaultDocument[]) {
  const counts = new Map<string, number>();
  for (const document of documents) {
    const label = document.category.replaceAll("_", " ");
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([label, count]) => ({ label, count }));
}

export function TripDetailsView(props: TripDetailsViewProps) {
  const {
    trip,
    focusedTraveler,
    focusedTravelerId,
    travelers,
    bookings,
    flights,
    journeys,
    costs,
    documents,
    readiness,
    archivedItems = [],
    notes = [],
    editable,
    isOwner,
    restorePending,
    navigationState,
    online
  } = props;

  const flightsByBooking = useMemo(() => groupByBookingId(flights), [flights]);
  const journeysByBooking = useMemo(() => groupByBookingId(journeys), [journeys]);
  const reservationCounts = useMemo(() => bookingCategoryCounts(bookings), [bookings]);
  const documentCounts = useMemo(() => documentCategoryCounts(documents), [documents]);
  const documentCountByBooking = useMemo(() => {
    const counts = new Map<string, number>();
    for (const document of documents) {
      if (!document.booking_id) continue;
      counts.set(document.booking_id, (counts.get(document.booking_id) ?? 0) + 1);
    }
    return counts;
  }, [documents]);
  const upcomingItinerary = useMemo(() => {
    const now = Date.now();
    return props.itinerary
      .filter((item) => new Date(item.ends_at ?? item.starts_at).getTime() >= now)
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))
      .slice(0, 3);
  }, [props.itinerary]);
  const rankedDocuments = useMemo(
    () =>
      rankDocumentsForUpcomingEvents({
        documents,
        itinerary: props.itinerary,
        bookings,
        flights,
        eventDocumentReferences: props.eventDocumentReferences
      }),
    [bookings, documents, flights, props.eventDocumentReferences, props.itinerary]
  );
  const neededDocuments = rankedDocuments
    .filter((item) => Number.isFinite(item.occursAt))
    .slice(0, 3);
  const documentPreview = neededDocuments.length
    ? neededDocuments
    : documents.slice(0, 3).map((document) => ({
        document,
        contextTitle: "Trip document"
      }));

  const navItems = [
    ...(upcomingItinerary.length
      ? ([["upcoming", "Next up", upcomingItinerary.length]] as const)
      : []),
    ["overview", "Overview"],
    ["reservations", "Reservations", bookings.length],
    ["costs", "Costs", costs.length],
    ["people", "People", travelers.length],
    ["readiness", "Readiness", readiness.total],
    ["documents", "Documents", documents.length],
    ["archived", "Archived", archivedItems.length],
    ["offline", "Offline"],
    ["metadata", "Travel data"],
    ["notes", "Notes", notes.length]
  ] as const;

  return (
    <main className="mt-5 space-y-5">
      <nav
        aria-label="Trip details sections"
        className="sticky top-2 z-30 flex gap-2 overflow-auto rounded-2xl border border-line bg-surface/95 p-2 shadow-soft backdrop-blur"
      >
        {navItems.map(([id, label, count]) => (
          <a
            className="shrink-0 rounded-xl bg-elevated px-3 py-2 text-xs font-bold text-brand"
            key={id}
            href={`#${id}`}
          >
            {label}
            {typeof count === "number" && count > 0 ? ` · ${count}` : ""}
          </a>
        ))}
      </nav>

      {upcomingItinerary.length > 0 && (
        <section
          id="upcoming"
          data-trip-scroll-anchor="details"
          className="surface-card scroll-mt-28 p-4 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <div>
              <p className="eyebrow">Timeline</p>
              <h2 className="mt-1 font-display text-xl font-black">Next up</h2>
            </div>
            <span className="mt-5 rounded-full bg-brand-soft px-2 py-0.5 text-xs font-black text-brand">
              {upcomingItinerary.length}
            </span>
          </div>
          <div className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line">
            {upcomingItinerary.map((item) => (
              <Link
                key={item.id}
                to={`/trips/${trip.id}`}
                state={tripIntentNavigationState(navigationState, trip.id, "target", {
                  view: "timeline",
                  targetId: item.id
                })}
                className="group grid min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2.5 hover:bg-elevated"
              >
                <EventTypeIcon
                  type={item.event_type ?? "custom"}
                  className="size-8 rounded-lg"
                  iconClassName="size-3.5"
                />
                <strong className="min-w-0 whitespace-normal break-words text-sm [overflow-wrap:anywhere]">
                  {item.title}
                </strong>
                <span className="whitespace-nowrap text-xs text-muted">
                  {formatEventTime(item.starts_at, item.timezone)}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <TripDetailsSection
        id="overview"
        eyebrow="Overview"
        title="Trip information"
        onActivate={isOwner ? props.onOpenSettings : undefined}
        action={
          isOwner && (
            <button type="button" onClick={props.onOpenSettings} className="secondary-button">
              <Settings className="size-4" /> Edit
            </button>
          )
        }
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Destination</dt>
            <dd className="mt-1 font-bold">{trip.destination_summary}</dd>
          </div>
          <div>
            <dt className="text-muted">Dates</dt>
            <dd className="mt-1 font-bold">{formatDateRange(trip.start_date, trip.end_date)}</dd>
          </div>
          <div>
            <dt className="text-muted">Default currency</dt>
            <dd className="mt-1 font-bold">{trip.base_currency}</dd>
          </div>
          <div>
            <dt className="text-muted">Fallback time zone</dt>
            <dd className="mt-1 font-bold">{trip.primary_timezone}</dd>
          </div>
        </dl>
      </TripDetailsSection>

      <TripDetailsSection
        id="reservations"
        eyebrow="Bookings"
        title={focusedTraveler ? `${focusedTraveler.display_name}'s reservations` : "Reservations"}
        count={bookings.length}
        action={
          editable && (
            <button type="button" className="secondary-button" onClick={props.onAddEvent}>
              <Plus className="size-4" /> Add
            </button>
          )
        }
      >
        <CollectionCounts values={reservationCounts} />
        {bookings.length ? (
          <div className="space-y-2">
            {bookings.slice(0, 3).map((booking) => (
              <ReservationRow
                key={booking.id}
                booking={booking}
                href={reservationHref(trip.id, booking, flights)}
                route={reservationRoute(booking, flightsByBooking, journeysByBooking)}
                documentCount={documentCountByBooking.get(booking.id)}
                navigationState={navigationState}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No relevant reservations yet.</p>
        )}
        {bookings.length > 0 && (
          <Link
            to={`/trips/${trip.id}/reservations`}
            state={navigationState}
            className="mt-4 flex items-center justify-end gap-1 text-sm font-extrabold text-brand"
          >
            View all {bookings.length} reservations <ChevronRight className="size-4" />
          </Link>
        )}
      </TripDetailsSection>

      <TripDetailsSection
        id="costs"
        eyebrow="Money"
        title={focusedTraveler ? `${focusedTraveler.display_name}'s trip costs` : "Trip expenses"}
        count={costs.length}
        onActivate={() => props.onOpenExpenses()}
        activateLabel="Open itemized trip expenses"
        action={
          editable && (
            <button type="button" className="secondary-button" onClick={props.onAddCost}>
              <Plus className="size-4" /> Add
            </button>
          )
        }
      >
        <CostTotals costs={costs} />
        <span className="mt-3 flex items-center justify-end gap-1 text-xs font-extrabold text-brand">
          View itemized expenses
          <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
        </span>
      </TripDetailsSection>

      <TripDetailsSection
        id="people"
        eyebrow="People & sharing"
        title={
          focusedTravelerId ? (focusedTraveler?.display_name ?? "Selected traveler") : "Everyone"
        }
        count={travelers.length}
        onActivate={props.onOpenPeople}
        activateLabel="Open People & sharing"
        action={
          <button
            type="button"
            className="secondary-button"
            onClick={(event) => props.onOpenPeople(event.currentTarget)}
          >
            <UsersRound className="size-4" /> Open
          </button>
        }
      >
        <p className="text-sm text-muted">
          Switch between the complete trip and one person's relevant timeline, reservations, costs,
          readiness, seats, and documents.
        </p>
      </TripDetailsSection>

      <TripDetailsSection
        id="readiness"
        eyebrow="Tasks"
        title="Tasks & readiness"
        count={readiness.total}
        onActivate={() => props.onOpenReadiness()}
        activateLabel="Open trip readiness"
        action={
          <Link
            className="secondary-button"
            to={`/trips/${trip.id}/readiness`}
            state={navigationState}
          >
            Open
          </Link>
        }
      >
        <p className="text-sm text-muted">
          {readiness.resolved} of {readiness.total} tasks done. Scheduled tasks also appear in the
          timeline.
        </p>
      </TripDetailsSection>

      <TripDetailsSection
        id="documents"
        eyebrow="Vault"
        title="Documents"
        count={documents.length}
        action={
          <button type="button" className="secondary-button" onClick={props.onUploadDocument}>
            <Plus className="size-4" /> Upload
          </button>
        }
      >
        <p className="text-sm text-muted">
          {documents.length} document{documents.length === 1 ? "" : "s"}{" "}
          {focusedTravelerId ? "for the selected traveler" : "in this trip"}
        </p>
        <div className="mt-3">
          <CollectionCounts values={documentCounts} />
          {neededDocuments.length > 0 && (
            <p className="mb-2 text-xs font-black uppercase tracking-[.12em] text-muted">
              Needed next
            </p>
          )}
          <div className="space-y-2">
            {documentPreview.map((item) => (
              <TripDocumentRow
                key={item.document.id}
                document={item.document}
                travelers={travelers}
                context={item.contextTitle}
                to={`/trips/${trip.id}/documents/${item.document.id}`}
                state={navigationState}
              />
            ))}
          </div>
          {!documents.length && <p className="text-sm text-muted">No relevant documents yet.</p>}
          {documents.length > 0 && (
            <Link
              to={`/trips/${trip.id}/documents`}
              state={navigationState}
              className="mt-4 flex items-center justify-end gap-1 text-sm font-extrabold text-brand"
            >
              View all {documents.length} documents <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </TripDetailsSection>

      <TripDetailsSection
        id="archived"
        eyebrow="Recoverable"
        title="Archived trip items"
        count={archivedItems.length}
      >
        <p className="text-sm text-muted">
          Archived events and booking groups leave the timeline, while their documents and costs
          stay available. Archived costs can also be restored here.
        </p>
        <div className="mt-4">
          <ProgressiveList
            items={archivedItems}
            initialCount={5}
            itemLabel="archived items"
            getKey={(item) => `${item.kind}:${item.id}`}
            empty={
              online ? (
                <p className="text-sm text-muted">Nothing is archived.</p>
              ) : (
                <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">
                  Connect to view and restore archived items.
                </p>
              )
            }
            renderItem={(item) => (
              <div className="flex items-center gap-3 rounded-xl bg-elevated p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <strong className="block">{item.title}</strong>
                  <span className="text-xs capitalize text-muted">{item.kind}</span>
                </span>
                {editable && (
                  <button
                    type="button"
                    className="secondary-button min-h-9 px-3 py-2 text-xs"
                    disabled={restorePending}
                    onClick={() => props.onRestoreArchived(item)}
                  >
                    <RotateCcw className="size-3.5" /> Restore
                  </button>
                )}
              </div>
            )}
          />
        </div>
      </TripDetailsSection>

      <TripDetailsSection id="offline" eyebrow="On this device" title="Offline pack">
        <OfflinePackControl tripId={trip.id} />
      </TripDetailsSection>

      <TripDetailsSection id="metadata" eyebrow="Travel metadata" title="Airlines">
        <TripAirlinesPanel tripId={trip.id} canEdit={editable} />
      </TripDetailsSection>

      <TripDetailsSection
        id="notes"
        eyebrow="Useful details"
        title="Notes"
        count={notes.length}
        action={
          editable && (
            <button type="button" className="secondary-button" onClick={props.onAddNote}>
              <Plus className="size-4" /> Add
            </button>
          )
        }
      >
        <ProgressiveList
          items={notes}
          initialCount={5}
          itemLabel="notes"
          getKey={(note) => note.id}
          empty={<p className="text-sm text-muted">No notes yet.</p>}
          renderItem={(note) => (
            <NoteCard
              note={note}
              editable={editable}
              onEdit={() => props.onEditNote(note)}
              onArchive={() => props.onArchiveNote(note)}
            />
          )}
        />
      </TripDetailsSection>
    </main>
  );
}
