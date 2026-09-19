import { ChevronRight, Plus, RotateCcw, UsersRound } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { EventTypeIcon } from "../../components/EventTypeIcon";
import { ProgressiveList } from "../../components/ProgressiveList";
import { TripDocumentRow } from "../../components/TripDocumentRow";
import { CostTotals } from "../../components/TripUi";
import { rankDocumentsForUpcomingEvents } from "../home/needNow";
import { OfflinePackControl } from "../readiness/OfflinePackControl";
import { formatEventTime } from "./presentation";
import { tripIntentNavigationState } from "./navigation";
import { NoteCard, ReservationRow } from "./TripDetailsCards";
import { TripDetailsSection } from "./TripDetailsSection";
import { TripReadinessSection } from "./TripReadinessSummary";
import { readinessSummary } from "../timeline/model";
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
  Requirement,
  Traveler,
  TripNote,
  VaultDocument
} from "../workspace/types";

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
  requirements?: Requirement[];
  onAddTask?: () => void;
  eventDocumentReferences?: EventDocumentReference[];
  archivedItems?: ArchivedTripItem[];
  notes?: TripNote[];
  editable: boolean;
  restorePending: boolean;
  navigationState?: unknown;
  online: boolean;
  onAddEvent: () => void;
  onOpenExpenses: () => void;
  onAddCost: () => void;
  onOpenPeople: (trigger: HTMLButtonElement) => void;
  onUploadDocument: () => void;
  onRestoreArchived: (item: ArchivedTripItem) => void;
  onAddNote: () => void;
  onEditNote: (note: TripNote) => void;
  onArchiveNote: (note: TripNote) => void;
};

function CollectionCounts({
  values,
  tripId,
  collection = "reservations",
  navigationState
}: {
  values: Array<{ label: string; count: number }>;
  tripId?: string;
  collection?: "reservations" | "documents";
  navigationState?: unknown;
}) {
  const visible = values.filter((value) => value.count > 0);
  if (!visible.length) return null;

  return (
    <div className="mb-2 flex flex-wrap gap-x-2" aria-label="Section summary">
      {visible.map((value) =>
        tripId ? (
          <Link
            key={value.label}
            to={`/trips/${tripId}/${collection}?category=${collection === "documents" ? encodeURIComponent(value.label.replaceAll(" ", "_")) : value.label === "Flights" ? "flight" : value.label === "Stays" ? "hotel" : value.label === "Ground & water" ? "journey" : "plan"}`}
            state={navigationState}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted hover:border-brand hover:text-ink"
          >
            {value.label} <strong className="text-ink">{value.count}</strong>
          </Link>
        ) : (
          <span
            key={value.label}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-bold text-muted"
          >
            {value.label} <strong className="text-ink">{value.count}</strong>
          </span>
        )
      )}
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
    archivedItems = [],
    notes = [],
    editable,
    restorePending,
    navigationState,
    online
  } = props;

  const flightsByBooking = useMemo(() => groupByBookingId(flights), [flights]);
  const readiness = readinessSummary(props.requirements ?? []);
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
    ["readiness", "Readiness", readiness.remaining],
    ...(upcomingItinerary.length
      ? ([["upcoming", "Next up", upcomingItinerary.length]] as const)
      : []),
    ["reservations", "Reservations", bookings.length],
    ["costs", "Expenses", costs.length],
    ["people", "People", travelers.length],
    ["documents", "Documents", documents.length],
    ["archived", "Archived", archivedItems.length],
    ["offline", "Offline"],
    ["metadata", "Travel data"],
    ["notes", "Notes", notes.length]
  ] as const;

  return (
    <main className="mt-3 space-y-3 sm:space-y-4">
      <nav
        aria-label="Trip details sections"
        className="flex gap-2 overflow-auto rounded-2xl border border-line bg-surface/95 p-2 shadow-soft backdrop-blur"
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

      <TripReadinessSection
        resolved={readiness.resolved}
        total={readiness.total}
        href={`/trips/${trip.id}/readiness`}
        navigationState={navigationState}
        onAddTask={editable ? props.onAddTask : undefined}
      />

      {upcomingItinerary.length > 0 && (
        <TripDetailsSection
          id="upcoming"
          eyebrow="Coming up"
          title="Next up"
          count={upcomingItinerary.length}
        >
          <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
            {upcomingItinerary.map((item) => (
              <Link
                key={item.id}
                to={`/trips/${trip.id}`}
                state={tripIntentNavigationState(navigationState, trip.id, "target", {
                  view: "timeline",
                  targetId: item.id
                })}
                className="group grid min-h-16 min-w-0 grid-cols-[2rem_minmax(0,1fr)_1rem] items-center gap-3 px-3 py-2.5 hover:bg-elevated"
              >
                <EventTypeIcon
                  type={item.event_type ?? "custom"}
                  className="size-8 rounded-lg"
                  iconClassName="size-3.5"
                />
                <span className="min-w-0">
                  <strong className="block whitespace-normal break-words text-sm leading-snug [overflow-wrap:anywhere]">
                    {item.title}
                  </strong>
                  <time
                    dateTime={item.starts_at}
                    className="mt-0.5 block text-xs leading-snug text-muted"
                  >
                    {formatEventTime(item.starts_at, item.timezone)}
                  </time>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        </TripDetailsSection>
      )}

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
        <CollectionCounts
          values={reservationCounts}
          tripId={trip.id}
          navigationState={navigationState}
        />
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
        title={focusedTraveler ? `${focusedTraveler.display_name}'s expenses` : "Expenses"}
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
        title="People"
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
        <p className="text-sm text-muted">Showing {focusedTraveler?.display_name ?? "Everyone"}</p>
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
        <div>
          <CollectionCounts
            values={documentCounts}
            tripId={trip.id}
            collection="documents"
            navigationState={navigationState}
          />
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
        {archivedItems.length > 0 && (
          <p className="mb-2 text-xs text-muted">
            Restore items to your trip. Documents and costs are kept.
          </p>
        )}
        <div>
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
        <OfflinePackControl tripId={trip.id} embedded />
      </TripDetailsSection>

      <TripDetailsSection id="metadata" eyebrow="Travel metadata" title="Airlines">
        <TripAirlinesPanel tripId={trip.id} canEdit={editable} embedded />
      </TripDetailsSection>

      <TripDetailsSection
        id="notes"
        eyebrow="Useful details"
        title="Notes"
        count={notes.length}
        contentClassName={notes.length ? "mt-2" : "mt-1"}
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
          empty={<p className="pb-1 text-center text-sm text-muted">No notes yet.</p>}
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
