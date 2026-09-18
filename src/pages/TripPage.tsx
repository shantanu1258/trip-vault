import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronRight,
  Download,
  LocateFixed,
  Info,
  ListTree,
  MapPin,
  NotebookPen,
  Pencil,
  Plus,
  ReceiptIndianRupee,
  Search,
  ShieldCheck,
  TicketCheck,
  Trash2,
  UserPlus,
  UsersRound,
  X,
  ExternalLink,
  Phone
} from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EventTypeIcon } from "../components/EventTypeIcon";
import { FocusSurface } from "../components/FocusSurface";
import { ModalSheet } from "../components/ModalSheet";
import { useConfirmDialog } from "../components/ConfirmDialogProvider";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { CompactCostTotal, ErrorCard, LoadingCard } from "../components/TripUi";
import { AddEventForm } from "../features/timeline/AddEventForm";
import {
  buildTripTimelineEntries,
  costsForEvent,
  eventEndDetails,
  eventEndTimeZone,
  eventTimeLabel,
  hasExplicitEventStart,
  journeyDuration,
  journeyRoute,
  mapsUrl,
  phoneActionUrls,
  plannedDurationLabel,
  readinessSummary,
  resolveCurrentTripTimelineEntry,
  searchTrip,
  sortTimelineItems,
  timelineEntryPhase,
  timelinePhase,
  type TimelinePhase,
  type TripTimelineEntry
} from "../features/timeline/model";
import { preferredScrollBehavior, scrollTimelineEventIntoView } from "../features/timeline/scroll";
import {
  archiveItineraryItem,
  archiveTripCost,
  listArchivedTripItems,
  listItinerary,
  reorderItineraryItems,
  restoreItineraryItem,
  restoreTripCost,
  setItineraryItemStatus,
  updateTripExpenseSplitting
} from "../features/trips/api";
import { downloadTripCalendar } from "../features/trips/calendar";
import {
  formatDateRange,
  formatEventTime,
  formatItineraryDate,
  formatMoney,
  getErrorMessage,
  itineraryDateKey
} from "../features/trips/presentation";
import { AddCostForm, AddItineraryForm, TripSettingsForm } from "../features/trips/TripForms";
import {
  isJourneyEventType,
  timelineEventTypes,
  type EventStatus,
  type ItineraryItem,
  type TimelineEventType,
  type Trip,
  type TripCost
} from "../features/trips/types";
import { calculateTripBalances } from "../features/trips/expenses";
import {
  consumeTripNavigationIntent,
  isTripRouteModal,
  isTripNavigationIntentConsumed,
  readTripEntry,
  readTripNavigationIntent,
  tripChildNavigationState,
  tripEntryNavigationState,
  tripIntentNavigationState,
  tripRouteModalNavigationState,
  type TripView
} from "../features/trips/navigation";
import { CostDetailsSheet, TripExpensesSheet } from "../features/trips/TripExpenses";
import { TripDetailsView } from "../features/trips/TripDetailsView";
import { TripAgendaSheet } from "../features/trips/TripAgendaSheet";
import { RequirementDetailsSheet } from "../features/readiness/RequirementDetailsSheet";
import { localProfileId } from "../features/sync/localSync";
import { suppressRealtimeRefresh } from "../features/sync/RealtimeRefresh";
import { tripQueries } from "../features/queries/tripQueries";
import { upsertById } from "../features/queries/cache";
import { EventDocuments, EventDocumentShortcut } from "../features/workspace/EventDocuments";
import {
  AddActivityBookingForm,
  canAddEventBooking
} from "../features/workspace/AddActivityBookingForm";
import { documentKind, suggestedDocumentTitle } from "../features/workspace/documentModel";
import { JourneyTravelerBadges } from "../features/workspace/JourneyTravelerDetails";
import { CabStopsManager } from "../features/workspace/CabStopsManager";
import { CabTimelineStops } from "../features/workspace/CabTimelineStops";
import {
  filterTravelerWorkspace,
  readTravelerFocus,
  requirementAudienceLabel,
  writeTravelerFocus
} from "../features/workspace/travelerFocus";
import { resolveBoardingInstant } from "../features/workspace/flight";
import {
  archiveNote,
  attachDocumentsToEvent,
  listCabStopsForTrip,
  listTripFlightTravelers,
  removeMember,
  removeTraveler,
  updateMemberRole,
  listTripItineraryParticipants,
  listTripBookingTravelers,
  listTripRequirementAssignees,
  updateRequirementStatus,
  uploadDocument,
  DuplicateDocumentError
} from "../features/workspace/api";
import {
  AddNoteForm,
  AddRequirementForm,
  AddTravelerForm,
  EditBookingForm,
  EditTravelerForm,
  ShareTripForm,
  UploadDocumentForm,
  type DocumentAssignmentPreset
} from "../features/workspace/WorkspaceForms";
import type {
  Booking,
  CabStop,
  FlightLeg,
  FlightTraveler,
  JourneyLeg,
  MemberRole,
  Requirement,
  RequirementStatus,
  Traveler,
  TripMember,
  TripNote,
  VaultDocument
} from "../features/workspace/types";

type OpenForm =
  | "event"
  | "cost"
  | "document"
  | "people"
  | "traveler"
  | "share"
  | "requirement"
  | "note"
  | "settings"
  | null;
type DocumentUploadTarget = Pick<ItineraryItem, "id" | "title"> & {
  booking_id?: string | null;
  assignmentPreset?: DocumentAssignmentPreset;
};

function openFormFromQuery(value: string | null): OpenForm {
  if (value === "event" || value === "itinerary" || value === "booking") return "event";
  if (
    ["cost", "document", "people", "traveler", "share", "requirement", "note", "settings"].includes(
      value ?? ""
    )
  )
    return value as Exclude<OpenForm, "event" | null>;
  return null;
}

type TripScrollSnapshot = { y: number; anchorId?: string; anchorOffset?: number };

function scrollStorageKey(tripId: string, view: TripView) {
  return `trip-vault:scroll:${tripId}:${view}`;
}

function captureScroll(view: TripView): TripScrollSnapshot {
  const viewportGuide = 104;
  const anchors = [
    ...document.querySelectorAll<HTMLElement>(`[data-trip-scroll-anchor="${view}"]`)
  ];
  const anchor = anchors
    .filter((element) => element.getBoundingClientRect().bottom > viewportGuide)
    .sort(
      (left, right) =>
        Math.abs(left.getBoundingClientRect().top - viewportGuide) -
        Math.abs(right.getBoundingClientRect().top - viewportGuide)
    )[0];
  return anchor?.id
    ? { y: window.scrollY, anchorId: anchor.id, anchorOffset: anchor.getBoundingClientRect().top }
    : { y: window.scrollY };
}

function saveScroll(tripId: string, view: TripView) {
  try {
    sessionStorage.setItem(scrollStorageKey(tripId, view), JSON.stringify(captureScroll(view)));
  } catch {
    /* Scroll memory is optional. */
  }
}

function readScroll(tripId: string, view: TripView): TripScrollSnapshot | null {
  try {
    const value = sessionStorage.getItem(scrollStorageKey(tripId, view));
    if (value === null) return null;
    if (!value.trim().startsWith("{")) {
      const y = Number(value);
      return Number.isFinite(y) ? { y } : null;
    }
    const parsed = JSON.parse(value) as Partial<TripScrollSnapshot>;
    return typeof parsed.y === "number" && Number.isFinite(parsed.y)
      ? (parsed as TripScrollSnapshot)
      : null;
  } catch {
    return null;
  }
}

function restoreScroll(tripId: string, view: TripView) {
  const saved = readScroll(tripId, view);
  if (!saved) return false;
  const anchor = saved.anchorId ? document.getElementById(saved.anchorId) : null;
  const top =
    anchor && typeof saved.anchorOffset === "number"
      ? Math.max(0, window.scrollY + anchor.getBoundingClientRect().top - saved.anchorOffset)
      : Math.max(0, saved.y);
  window.scrollTo({ top, behavior: "auto" });
  return true;
}

function markBrowserTripEntry(state: unknown, tripId: string, view: TripView) {
  const browserState = window.history.state;
  if (!browserState || typeof browserState !== "object" || !("usr" in browserState)) return;
  window.history.replaceState(
    { ...browserState, usr: tripEntryNavigationState(state, tripId, view) },
    ""
  );
}

function EventCost({
  item,
  costs,
  editable,
  onAdd,
  onView
}: {
  item: ItineraryItem;
  costs: TripCost[];
  editable: boolean;
  onAdd: () => void;
  onView: (cost: TripCost) => void;
}) {
  const linked = costsForEvent(item, costs);
  if (!linked.length)
    return editable ? (
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-extrabold text-warning"
      >
        Cost missing · add to this event
      </button>
    ) : (
      <span className="mt-4 inline-flex rounded-full bg-warning/10 px-3 py-1.5 text-xs font-bold text-warning">
        Cost missing
      </span>
    );
  const byCurrency = new Map<string, number>();
  for (const cost of linked.filter((cost) => cost.payment_status !== "refunded"))
    byCurrency.set(
      cost.currency_code,
      (byCurrency.get(cost.currency_code) ?? 0) + cost.amount_minor
    );
  const summary = byCurrency.size
    ? [...byCurrency]
        .map(([currency, amount]) => (amount === 0 ? "Free" : formatMoney(amount, currency)))
        .join(" + ")
    : "No active cost";
  return (
    <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[.1em] text-success">
          Cost · {summary}
        </p>
        {editable && (
          <button type="button" onClick={onAdd} className="text-xs font-extrabold text-brand">
            + Add
          </button>
        )}
      </div>
      <div className="mt-2 space-y-1.5">
        {linked.map((cost) => (
          <button
            key={cost.id}
            type="button"
            onClick={() => onView(cost)}
            className="group flex w-full items-center gap-3 rounded-lg bg-surface/70 px-3 py-2 text-left text-xs transition hover:bg-surface focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={`View details for ${cost.title}`}
          >
            <span className="min-w-0 flex-1 truncate font-bold">{cost.title}</span>
            <span className="capitalize text-muted">{cost.payment_status}</span>
            <strong>
              {cost.amount_minor === 0
                ? "Free"
                : formatMoney(cost.amount_minor, cost.currency_code)}
            </strong>
            <ChevronRight className="size-3 text-muted transition-transform group-hover:translate-x-0.5" />
          </button>
        ))}
      </div>
    </div>
  );
}

export {
  indexFirstFlightByBooking,
  NoteCard,
  ReservationCard
} from "../features/trips/TripDetailsCards";

function FlightTravelerSummary({
  flightLegId,
  flightTravelers,
  travelers,
  focusedTravelerId
}: {
  flightLegId: string;
  flightTravelers: FlightTraveler[];
  travelers: Traveler[];
  focusedTravelerId?: string | null;
}) {
  const rows = flightTravelers
    .filter((row) => row.flight_leg_id === flightLegId)
    .filter((row) => !focusedTravelerId || row.traveler_id === focusedTravelerId)
    .filter((row) => row.seat || row.boarding_group || row.ticket_number);
  if (!rows.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Traveler flight details">
      {rows.map((row) => {
        const travelerName =
          travelers.find((traveler) => traveler.id === row.traveler_id)?.display_name ?? "Traveler";
        const details = [
          row.seat ? `Seat ${row.seat}` : null,
          row.boarding_group ? `Group ${row.boarding_group}` : null,
          row.ticket_number ? `Ticket ${row.ticket_number}` : null
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <span key={row.id} className="rounded-lg bg-brand-soft px-2 py-1 font-bold text-brand">
            {travelerName} · {details}
          </span>
        );
      })}
    </div>
  );
}

function BookingEventDetails({
  tripId,
  booking,
  flights,
  flightTravelers,
  journeys,
  travelers,
  focusedTravelerId,
  navigationState
}: {
  tripId: string;
  booking: Booking;
  flights: FlightLeg[];
  flightTravelers: FlightTraveler[];
  journeys: JourneyLeg[];
  travelers: Traveler[];
  focusedTravelerId?: string | null;
  navigationState?: unknown;
}) {
  const flightLegs = flights
    .filter((leg) => leg.booking_id === booking.id)
    .sort((a, b) => a.segment_order - b.segment_order);
  const travelLegs = journeys
    .filter((leg) => leg.booking_id === booking.id)
    .sort((a, b) => a.segment_order - b.segment_order);
  const route = flightLegs.length
    ? journeyRoute(
        flightLegs.map((leg) => ({
          origin: leg.departure_airport_code || leg.departure_airport_name,
          destination: leg.arrival_airport_code || leg.arrival_airport_name
        }))
      )
    : journeyRoute(
        travelLegs.map((leg) => ({
          origin: leg.origin_code || leg.origin_name,
          destination: leg.destination_code || leg.destination_name
        }))
      );
  const phone = booking.contact_phone ? phoneActionUrls(booking.contact_phone) : null;
  const firstFlight = flightLegs[0];
  const detailsHref = firstFlight
    ? `/trips/${tripId}/flights/${firstFlight.id}`
    : `/trips/${tripId}/bookings/${booking.id}`;

  const heading = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[.65rem] font-black uppercase tracking-[.12em] text-muted">
          {booking.type} booking{booking.journey_scope ? ` · ${booking.journey_scope}` : ""}
        </p>
        <p className="mt-1 font-bold">{booking.provider || booking.title}</p>
        {route && <p className="mt-1 font-black text-brand">{route}</p>}
        {booking.reference_code && (
          <p className="mt-1 text-xs text-muted">
            <strong className="text-ink">{booking.type === "flight" ? "PNR" : "Reference"}:</strong>{" "}
            {booking.reference_code}
          </p>
        )}
      </div>
      <span aria-hidden="true" className="secondary-button min-h-9 px-3 py-2 text-xs">
        Full details <ExternalLink className="size-3.5" />
      </span>
    </div>
  );
  const detailsLink = (
    <Link
      to={detailsHref}
      state={navigationState}
      className="absolute inset-0 z-10 rounded-2xl focus-visible:ring-2 focus-visible:ring-brand"
      aria-label={`Open booking details for ${booking.title}`}
    />
  );

  if (flightLegs.length) {
    return (
      <div className="group relative mt-4 rounded-2xl border border-line bg-surface/70 p-3 transition hover:border-brand/40 hover:shadow-soft sm:p-4">
        {detailsLink}
        {heading}
        <div className="relative z-20 mt-3 space-y-2">
          {flightLegs.map((leg, index) => (
            <Link
              to={`/trips/${tripId}/flights/${leg.id}`}
              state={navigationState}
              key={leg.id}
              className="block rounded-xl bg-elevated p-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <strong>
                  {leg.departure_airport_code || leg.departure_airport_name} →{" "}
                  {leg.arrival_airport_code || leg.arrival_airport_name}
                </strong>
                <span
                  className={`rounded-full px-2 py-1 text-[.6rem] font-black uppercase ${leg.status === "cancelled" ? "bg-danger/10 text-danger" : leg.status === "delayed" ? "bg-warning/10 text-warning" : "bg-brand-soft text-brand"}`}
                >
                  {flightLegs.length > 1 ? `Connection ${index + 1} · ` : ""}
                  {leg.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-1 text-muted">
                {leg.airline_name} {leg.flight_number} ·{" "}
                {journeyDuration(leg.scheduled_departure_at, leg.scheduled_arrival_at)}
              </p>
              <p className="mt-1 text-muted">
                Depart {formatEventTime(leg.scheduled_departure_at, leg.departure_timezone)}
              </p>
              <p className="text-muted">
                Arrive {formatEventTime(leg.scheduled_arrival_at, leg.arrival_timezone)}
              </p>
              {(resolveBoardingInstant(
                leg.scheduled_departure_at,
                leg.boarding_at,
                leg.boarding_lead_minutes
              ) ||
                leg.departure_terminal ||
                leg.departure_gate ||
                leg.arrival_terminal ||
                leg.baggage_claim) && (
                <p className="mt-2 font-bold text-ink">
                  {resolveBoardingInstant(
                    leg.scheduled_departure_at,
                    leg.boarding_at,
                    leg.boarding_lead_minutes
                  )
                    ? `Board ${formatEventTime(resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes)!, leg.departure_timezone)} · `
                    : ""}
                  T{leg.departure_terminal || "—"} · Gate {leg.departure_gate || "—"}
                  {leg.arrival_terminal ? ` · Arrive T${leg.arrival_terminal}` : ""}
                  {leg.baggage_claim ? ` · Bag ${leg.baggage_claim}` : ""}
                </p>
              )}
              <FlightTravelerSummary
                flightLegId={leg.id}
                flightTravelers={flightTravelers}
                travelers={travelers}
                focusedTravelerId={focusedTravelerId}
              />
            </Link>
          ))}
        </div>
        <BookingContact booking={booking} phone={phone} />
      </div>
    );
  }
  if (travelLegs.length) {
    return (
      <div className="group relative mt-4 rounded-2xl border border-line bg-surface/70 p-3 transition hover:border-brand/40 hover:shadow-soft sm:p-4">
        {detailsLink}
        {heading}
        <div className="relative z-20 mt-3 space-y-2">
          {travelLegs.map((leg, index) => (
            <Link
              to={detailsHref}
              state={navigationState}
              key={leg.id}
              className="block rounded-xl bg-elevated p-3 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <strong>
                  {leg.origin_code || leg.origin_name} →{" "}
                  {leg.destination_code || leg.destination_name}
                </strong>
                {travelLegs.length > 1 && (
                  <span className="rounded-full bg-brand-soft px-2 py-1 text-[.6rem] font-black uppercase text-brand">
                    Connection {index + 1}
                  </span>
                )}
              </div>
              <p className="mt-1 text-muted">
                {leg.operator_name}
                {leg.service_number ? ` ${leg.service_number}` : ""}
                {leg.scheduled_arrival_at
                  ? ` · ${journeyDuration(leg.scheduled_departure_at, leg.scheduled_arrival_at)}`
                  : ""}
              </p>
              <p className="mt-1 text-muted">
                Depart {formatEventTime(leg.scheduled_departure_at, leg.origin_timezone)}
              </p>
              <p className="text-muted">
                {leg.scheduled_arrival_at
                  ? `Arrive ${formatEventTime(leg.scheduled_arrival_at, leg.destination_timezone)}`
                  : "Arrival not added"}
              </p>
              {(resolveBoardingInstant(
                leg.scheduled_departure_at,
                leg.boarding_at,
                leg.boarding_lead_minutes
              ) ||
                leg.departure_platform ||
                leg.arrival_platform) && (
                <p className="mt-2 font-bold text-ink">
                  {resolveBoardingInstant(
                    leg.scheduled_departure_at,
                    leg.boarding_at,
                    leg.boarding_lead_minutes
                  )
                    ? `Board ${formatEventTime(resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes)!, leg.origin_timezone)} · `
                    : ""}
                  Platform {leg.departure_platform || "—"}
                  {leg.arrival_platform ? ` → ${leg.arrival_platform}` : ""}
                </p>
              )}
              <JourneyTravelerBadges
                tripId={tripId}
                leg={leg}
                travelers={travelers}
                focusedTravelerId={focusedTravelerId}
                legIndex={index}
                legCount={travelLegs.length}
              />
            </Link>
          ))}
        </div>
        <BookingContact booking={booking} phone={phone} />
      </div>
    );
  }
  return (
    <div className="group relative mt-4 rounded-2xl border border-line bg-surface/70 p-3 transition hover:border-brand/40 hover:shadow-soft sm:p-4">
      {detailsLink}
      {heading}
      {(booking.start_at || booking.end_at || booking.location?.label) && (
        <div className="mt-3 rounded-xl bg-elevated p-3 text-xs text-muted">
          {booking.start_at && (
            <p>Starts {formatEventTime(booking.start_at, booking.source_timezone || "UTC")}</p>
          )}
          {booking.end_at && (
            <p>Ends {formatEventTime(booking.end_at, booking.source_timezone || "UTC")}</p>
          )}
          {booking.location?.label && <p className="mt-1">{booking.location.label}</p>}
        </div>
      )}
      <BookingContact booking={booking} phone={phone} />
    </div>
  );
}

function BookingContact({
  booking,
  phone
}: {
  booking: Booking;
  phone: ReturnType<typeof phoneActionUrls>;
}) {
  if (!booking.booked_via_name && !booking.booked_via_url && !booking.contact_phone) return null;
  return (
    <div className="relative z-20 mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs">
      <span className="text-muted">
        {booking.booked_via_name ? `Booked via ${booking.booked_via_name}` : "Booking contact"}
      </span>
      {booking.booked_via_url && (
        <a
          className="font-extrabold text-brand"
          href={booking.booked_via_url}
          target="_blank"
          rel="noreferrer"
        >
          Open website
        </a>
      )}
      {phone && (
        <>
          <a className="inline-flex items-center gap-1 font-extrabold text-brand" href={phone.call}>
            <Phone className="size-3" /> Call
            {booking.contact_name ? ` ${booking.contact_name}` : ""}
          </a>
          <a
            className="inline-flex items-center gap-1 font-extrabold text-success"
            href={phone.whatsapp}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsAppIcon className="size-3.5" /> WhatsApp
          </a>
        </>
      )}
    </div>
  );
}

function EventTravelers({
  item,
  travelerIds,
  travelers
}: {
  item: ItineraryItem;
  travelerIds: string[];
  travelers: Traveler[];
}) {
  const names = travelerIds
    .map((id) => travelers.find((traveler) => traveler.id === id)?.display_name)
    .filter((name): name is string => Boolean(name));
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
      <UsersRound className="size-4" />
      <span className="font-bold text-ink">For:</span>
      {item.applies_to_all_travelers ? (
        <span>Everyone</span>
      ) : names.length ? (
        names.map((name) => (
          <span key={name} className="rounded-full bg-brand-soft px-2 py-1 font-bold text-brand">
            {name}
          </span>
        ))
      ) : (
        <span>Selected travelers</span>
      )}
    </div>
  );
}

function BookingEventSummary({
  tripId,
  booking,
  flights,
  flightTravelers,
  journeys,
  travelers,
  focusedTravelerId,
  cabStops,
  eventTimezone
}: {
  tripId: string;
  booking: Booking;
  flights: FlightLeg[];
  flightTravelers: FlightTraveler[];
  journeys: JourneyLeg[];
  travelers: Traveler[];
  focusedTravelerId?: string | null;
  cabStops: CabStop[];
  eventTimezone: string;
}) {
  const flightLegs = flights
    .filter((leg) => leg.booking_id === booking.id)
    .sort((a, b) => a.segment_order - b.segment_order);
  const travelLegs = journeys
    .filter((leg) => leg.booking_id === booking.id)
    .sort((a, b) => a.segment_order - b.segment_order);
  const legs = flightLegs.length ? flightLegs : travelLegs;
  const travelLegIds = new Set(travelLegs.map((leg) => leg.id));
  const bookingCabStops = cabStops.filter((stop) => travelLegIds.has(stop.journey_leg_id));
  const reservationState = booking.type === "flight" ? "booked" : booking.reservation_state;
  const phone =
    booking.type === "cab" && booking.contact_phone ? phoneActionUrls(booking.contact_phone) : null;
  const route = journeyRoute(
    legs.map((leg) =>
      "departure_airport_code" in leg
        ? {
            origin: leg.departure_airport_code || leg.departure_airport_name,
            destination: leg.arrival_airport_code || leg.arrival_airport_name
          }
        : {
            origin: leg.origin_code || leg.origin_name,
            destination: leg.destination_code || leg.destination_name
          }
    )
  );
  return (
    <div className="mt-3 rounded-xl border border-line/80 bg-surface/60 px-3 py-2.5 text-xs">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong>{booking.provider || booking.title}</strong>
        {booking.reference_code && (
          <span className="text-muted">
            {booking.type === "flight" ? "PNR" : "Ref"} {booking.reference_code}
          </span>
        )}
        {reservationState && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-black capitalize text-brand">
            {reservationState.replaceAll("_", " ")}
          </span>
        )}
      </div>
      {route && (
        <p className="mt-1 font-bold text-brand">
          {route}
          {legs.length > 1 ? ` · ${legs.length - 1} connection${legs.length > 2 ? "s" : ""}` : ""}
        </p>
      )}
      {flightLegs.map((leg, index) => {
        const boarding = resolveBoardingInstant(
          leg.scheduled_departure_at,
          leg.boarding_at,
          leg.boarding_lead_minutes
        );
        const operations = [
          boarding ? `Board ${formatEventTime(boarding, leg.departure_timezone)}` : null,
          leg.departure_terminal ? `T${leg.departure_terminal}` : null,
          leg.departure_gate ? `Gate ${leg.departure_gate}` : null
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div key={leg.id} className={index ? "mt-2 border-t border-line/70 pt-2" : "mt-2"}>
            {flightLegs.length > 1 && (
              <p className="font-black text-ink">
                Connection {index + 1} · {leg.departure_airport_code || leg.departure_airport_name}{" "}
                → {leg.arrival_airport_code || leg.arrival_airport_name}
              </p>
            )}
            {operations && <p className="mt-1 font-bold text-ink">{operations}</p>}
            <FlightTravelerSummary
              flightLegId={leg.id}
              flightTravelers={flightTravelers}
              travelers={travelers}
              focusedTravelerId={focusedTravelerId}
            />
          </div>
        );
      })}
      {travelLegs.map((leg, index) => (
        <JourneyTravelerBadges
          key={leg.id}
          tripId={tripId}
          leg={leg}
          travelers={travelers}
          focusedTravelerId={focusedTravelerId}
          legIndex={index}
          legCount={travelLegs.length}
        />
      ))}
      {booking.type === "cab" && (
        <CabTimelineStops stops={bookingCabStops} eventTimezone={eventTimezone} />
      )}
      {phone && (
        <a
          className="relative z-20 mt-2 inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 font-extrabold text-brand"
          href={phone.call}
        >
          <Phone className="size-3.5" /> Call cab contact
        </a>
      )}
    </div>
  );
}

export function EventDetailsSheet({
  item,
  itinerary = [],
  tripId,
  booking,
  flights,
  flightTravelers,
  journeys,
  travelerIds,
  travelers,
  costs,
  tripCurrency,
  focusedTravelerId,
  navigationState,
  editable,
  canMoveUp,
  canMoveDown,
  onClose,
  onEdit,
  onArchive,
  onAddBooking,
  onAddCost,
  onViewCost,
  onUploadDocument,
  onStatus,
  onMoveUp,
  onMoveDown,
  routeBacked = false
}: {
  item: ItineraryItem;
  itinerary?: ItineraryItem[];
  tripId: string;
  booking?: Booking;
  flights: FlightLeg[];
  flightTravelers: FlightTraveler[];
  journeys: JourneyLeg[];
  travelerIds: string[];
  travelers: Traveler[];
  costs: TripCost[];
  tripCurrency?: string;
  focusedTravelerId?: string | null;
  navigationState?: unknown;
  editable: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onAddBooking: () => void;
  onAddCost: () => void;
  onViewCost: (cost: TripCost) => void;
  onUploadDocument: () => void;
  onStatus: (status: EventStatus) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  routeBacked?: boolean;
}) {
  const map = mapsUrl(item.location);
  const end = eventEndDetails(item);
  const endTimeZone = eventEndTimeZone(item, flights, journeys);
  const timingLabel = eventTimeLabel(item, itinerary);
  const plannedDuration = plannedDurationLabel(item);
  const explicitStart = hasExplicitEventStart(item);
  const showTimeZone =
    isJourneyEventType(item.event_type) && booking?.journey_scope === "international";
  return (
    <ModalSheet
      eyebrow={(item.event_type ?? "event").replaceAll("_", " ")}
      title={item.title}
      onClose={onClose}
      manageHistory={!routeBacked}
    >
      <div className="mt-5 flex items-start gap-4 rounded-2xl bg-elevated p-4">
        <EventTypeIcon type={item.event_type ?? "custom"} className="size-11 rounded-xl" />
        <div className="min-w-0">
          <p className="text-sm font-black">
            {timingLabel ?? formatEventTime(item.starts_at, item.timezone)}
          </p>
          {item.timing_mode === "relative" && explicitStart && (
            <p className="mt-1 text-xs font-bold text-ink">
              Starts {formatEventTime(item.starts_at, item.timezone)}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {item.timing_mode === "unscheduled"
              ? "Schedule this when your plan is clearer"
              : item.timing_mode === "relative" && !explicitStart
                ? "Ordered on the timeline; start time is still optional"
                : showTimeZone
                  ? item.timezone
                  : "Local schedule"}
          </p>
          {end && (
            <p className="mt-2 text-xs text-muted">
              {end.journey ? "Arrives" : "Ends"} {formatEventTime(end.endsAt, endTimeZone)} ·{" "}
              {end.duration}
            </p>
          )}
          {plannedDuration && (
            <p className="mt-2 text-xs text-muted">Planned duration · {plannedDuration}</p>
          )}
          <span className="mt-2 inline-flex rounded-full bg-surface px-2 py-1 text-[.65rem] font-black uppercase text-muted">
            {(item.event_status ?? "planned").replaceAll("_", " ")}
          </span>
        </div>
      </div>
      <EventTravelers item={item} travelerIds={travelerIds} travelers={travelers} />
      {item.location?.label && (
        <p className="mt-4 flex items-start gap-2 text-sm text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" />
          {item.location.label}
        </p>
      )}
      {map && (
        <a
          href={map}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-brand"
        >
          <LocateFixed className="size-4" /> Navigate
        </a>
      )}
      {item.notes && (
        <p className="mt-4 whitespace-pre-wrap rounded-xl bg-elevated p-3 text-sm leading-6 text-muted">
          {item.notes}
        </p>
      )}
      {booking && (
        <>
          <BookingEventDetails
            tripId={tripId}
            booking={booking}
            flights={flights}
            flightTravelers={flightTravelers}
            journeys={journeys}
            travelers={travelers}
            focusedTravelerId={focusedTravelerId}
            navigationState={navigationState}
          />
          {booking.type === "cab" &&
            journeys
              .filter((leg) => leg.booking_id === booking.id && leg.mode === "cab")
              .map((leg) => (
                <CabStopsManager
                  key={leg.id}
                  tripId={tripId}
                  leg={leg}
                  itinerary={itinerary}
                  costs={costs}
                  currencyCode={tripCurrency ?? "USD"}
                  eventTimezone={item.timezone}
                  participantTravelerIds={
                    item.applies_to_all_travelers ? travelers.map((row) => row.id) : travelerIds
                  }
                  editable={editable}
                />
              ))}
        </>
      )}
      {editable && canAddEventBooking(item) && (
        <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-4">
          <p className="text-sm font-extrabold">Booked this event now?</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Add the confirmation and provider without recreating the timeline event or changing its
            order.
          </p>
          <button type="button" className="secondary-button mt-3" onClick={onAddBooking}>
            <TicketCheck className="size-4" /> Add booking details
          </button>
        </div>
      )}
      {editable && (
        <fieldset className="mt-5 rounded-2xl border border-line p-3">
          <legend className="px-1 text-xs font-black uppercase tracking-[.12em] text-muted">
            Event status
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["planned", "done", "skipped", "cancelled"] as EventStatus[]).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => onStatus(status)}
                className={`rounded-xl px-3 py-2 text-xs font-extrabold capitalize ${(item.event_status ?? "planned") === status ? "bg-brand text-surface" : "bg-elevated text-muted"}`}
              >
                {status}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <EventCost
        item={item}
        costs={costs}
        editable={editable}
        onAdd={onAddCost}
        onView={onViewCost}
      />
      <EventDocuments
        item={item}
        canEdit={editable}
        onUpload={onUploadDocument}
        travelerId={focusedTravelerId}
        travelers={travelers}
        navigationState={navigationState}
      />
      {editable && item.timing_mode !== "relative" && (canMoveUp || canMoveDown) && (
        <div className="mt-5 flex gap-2">
          <span className="self-center text-xs font-bold text-muted">Same-time order:</span>
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="secondary-button min-h-9 px-3 py-2 text-xs disabled:opacity-30"
          >
            <ArrowUp className="size-3.5" /> Earlier
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="secondary-button min-h-9 px-3 py-2 text-xs disabled:opacity-30"
          >
            <ArrowDown className="size-3.5" /> Later
          </button>
        </div>
      )}
      {editable && (
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5">
          <button type="button" className="secondary-button" onClick={onEdit}>
            <Pencil className="size-4" /> Edit event
          </button>
          <button type="button" className="secondary-button text-danger" onClick={onArchive}>
            <Trash2 className="size-4" /> Archive
          </button>
        </div>
      )}
    </ModalSheet>
  );
}

const phaseLabels: Record<TimelinePhase, string> = {
  past: "Past",
  current: "Happening now",
  future: "Upcoming",
  unscheduled: "Unscheduled"
};

function phaseForActive(item: ItineraryItem, active: boolean) {
  const phase = timelinePhase(item);
  if (!active) return phaseLabels[phase];
  if (phase === "current") return "Happening now";
  if (phase === "future") return "Next event";
  if (phase === "unscheduled") return "Needs scheduling";
  return "Most recent event";
}

function PeopleSheet({
  trip,
  travelers,
  members,
  selectedId,
  editable,
  isOwner,
  onSelect,
  onEdit,
  onAdd,
  onShare,
  onClose,
  onRefresh
}: {
  trip: Trip;
  travelers: Traveler[];
  members: TripMember[];
  selectedId: string | null;
  editable: boolean;
  isOwner: boolean;
  onSelect: (id: string | null) => void;
  onEdit: (traveler: Traveler) => void;
  onAdd: () => void;
  onShare: () => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const confirm = useConfirmDialog();
  return (
    <ModalSheet eyebrow={trip.title} title="People & sharing" onClose={onClose}>
      <p className="mt-3 text-sm leading-6 text-muted">
        Choose whose plan and documents you are working with. Switching never asks for extra
        permission; access still requires signing in.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-2xl border p-4 text-left ${selectedId === null ? "border-brand bg-brand-soft" : "border-line"}`}
        >
          <UsersRound className="size-5 text-brand" />
          <strong className="mt-3 block">Everyone</strong>
        </button>
        {travelers.map((traveler) => (
          <article
            key={traveler.id}
            className={`grid min-w-0 grid-cols-[minmax(0,1fr)_2.75rem] overflow-hidden rounded-2xl border ${selectedId === traveler.id ? "border-brand bg-brand-soft" : "border-line"}`}
          >
            <button
              type="button"
              onClick={() => onSelect(traveler.id)}
              aria-label={`Show ${traveler.display_name}'s trip information`}
              className="min-w-0 p-4 pr-1 text-left"
            >
              <span className="grid size-7 place-items-center rounded-full bg-brand text-[.65rem] font-black text-surface">
                {traveler.display_name.slice(0, 2).toUpperCase()}
              </span>
              <strong className="mt-3 block truncate">{traveler.display_name}</strong>
              <span className="text-xs text-muted">
                {traveler.is_minor ? "Managed child" : "Traveler"}
              </span>
            </button>
            {editable && (
              <button
                type="button"
                onClick={() => onEdit(traveler)}
                className="tap-target grid size-11 place-items-center self-start rounded-xl text-muted hover:bg-elevated hover:text-ink"
                aria-label={`Edit ${traveler.display_name}`}
              >
                <Pencil className="size-4" />
              </button>
            )}
          </article>
        ))}
      </div>
      {editable && (
        <button type="button" onClick={onAdd} className="secondary-button mt-4 w-full">
          <UserPlus className="size-4" /> Add traveler
        </button>
      )}
      <div className="mt-6 border-t border-line pt-5">
        <p className="eyebrow">Signed-in members</p>
        <div className="mt-3 space-y-3">
          {members.map((member) => (
            <div
              className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm"
              key={member.user_id}
            >
              <span className="min-w-0 flex-1 truncate font-bold">
                {member.display_name}
                {member.participation_type === "collaborator" ? " · helper" : ""}
              </span>
              {isOwner && member.role !== "owner" ? (
                <>
                  <select
                    aria-label={`Role for ${member.display_name}`}
                    className="rounded-lg border border-line bg-surface p-2 capitalize"
                    defaultValue={member.role}
                    onChange={async (event) => {
                      await updateMemberRole(
                        trip.id,
                        member.user_id,
                        event.target.value as "editor" | "viewer"
                      );
                      onRefresh();
                    }}
                  >
                    <option value="editor">editor</option>
                    <option value="viewer">viewer</option>
                  </select>
                  <button
                    type="button"
                    className="text-xs font-bold text-danger"
                    onClick={async () => {
                      if (
                        !(await confirm({
                          title: "Remove trip member?",
                          message: `Remove ${member.display_name}? Downloaded copies cannot be erased remotely.`,
                          confirmLabel: "Remove",
                          tone: "danger"
                        }))
                      )
                        return;
                      await removeMember(trip.id, member.user_id);
                      onRefresh();
                    }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-xs capitalize text-muted">{member.role}</span>
              )}
            </div>
          ))}
        </div>
        {isOwner && (
          <button type="button" className="primary-button mt-4 w-full" onClick={onShare}>
            <UsersRound className="size-4" /> Share trip
          </button>
        )}
      </div>
    </ModalSheet>
  );
}

export function TripPage() {
  const confirm = useConfirmDialog();
  const { tripId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const view: TripView = searchParams.get("view") === "details" ? "details" : "timeline";
  const requestedForm = openFormFromQuery(searchParams.get("add"));
  const routedEventId = searchParams.get("event");
  const agendaOpen = searchParams.get("agenda") === "open";
  const requestedEventType = searchParams.get("eventType");
  const routedEventType = timelineEventTypes.includes(requestedEventType as TimelineEventType)
    ? (requestedEventType as TimelineEventType)
    : null;
  const requestedSection = searchParams.get("section");
  const [openForm, setOpenForm] = useState<OpenForm>(requestedForm);
  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState("");
  const [editingItinerary, setEditingItinerary] = useState<ItineraryItem | null>(null);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editingCost, setEditingCost] = useState<TripCost | null>(null);
  const [editingTraveler, setEditingTraveler] = useState<Traveler | null>(null);
  const [editingNote, setEditingNote] = useState<TripNote | null>(null);
  const [editingRequirement, setEditingRequirement] = useState<Requirement | null>(null);
  const [viewingRequirement, setViewingRequirement] = useState<Requirement | null>(null);
  const [showingExpenses, setShowingExpenses] = useState(false);
  const [viewingCost, setViewingCost] = useState<TripCost | null>(null);
  const [costReturnEventId, setCostReturnEventId] = useState<string | null>(null);
  const [costReturnsToExpenses, setCostReturnsToExpenses] = useState(false);
  const [costTargetItem, setCostTargetItem] = useState<ItineraryItem | null>(null);
  const [documentTargetItem, setDocumentTargetItem] = useState<DocumentUploadTarget | null>(null);
  const [documentToAttach, setDocumentToAttach] = useState<{ id: string; title: string } | null>(
    null
  );
  const [eventBookingTarget, setEventBookingTarget] = useState<ItineraryItem | null>(null);
  const [focusedTravelerId, setFocusedTravelerId] = useState<string | null>(() =>
    readTravelerFocus(tripId)
  );
  const [travelerAnnouncement, setTravelerAnnouncement] = useState("");
  const [timelineStatus, setTimelineStatus] = useState("");
  const [advanceAfterRequirementId, setAdvanceAfterRequirementId] = useState<string | null>(null);
  const positioned = useRef(false);
  const requestedTimelineItem = useRef<string | null>(null);
  const searchRegionRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const peopleTriggerRef = useRef<HTMLButtonElement | null>(null);
  const handledIntentToken = useRef<string | null>(null);
  const handledSection = useRef<string | null>(null);
  const navigationIntent = readTripNavigationIntent(location.state, tripId);
  const activeNavigationIntent =
    navigationIntent && !isTripNavigationIntentConsumed(navigationIntent) ? navigationIntent : null;
  const returningToEntry =
    Boolean(readTripEntry(location.state, tripId)) ||
    Boolean(navigationIntent && isTripNavigationIntentConsumed(navigationIntent));
  const childNavigationState = tripChildNavigationState(
    location.state,
    tripId,
    view,
    `${location.pathname}${location.search}`
  );
  useEffect(() => {
    void localProfileId().then((id) => setUserId(id ?? ""));
  }, []);
  useEffect(() => {
    setFocusedTravelerId(readTravelerFocus(tripId));
    positioned.current = false;
  }, [tripId]);
  useEffect(() => {
    if (requestedForm) setOpenForm(requestedForm);
    else setOpenForm((current) => (current === "event" ? null : current));
  }, [requestedForm]);
  useLayoutEffect(() => {
    positioned.current = false;
  }, [tripId, view]);
  useLayoutEffect(() => {
    if (!requestedSection) {
      handledSection.current = null;
      return;
    }
    if (handledSection.current === requestedSection) return;
    handledSection.current = requestedSection;
    positioned.current = false;
  }, [requestedSection]);
  useLayoutEffect(() => {
    if (!activeNavigationIntent || handledIntentToken.current === activeNavigationIntent.token)
      return;
    handledIntentToken.current = activeNavigationIntent.token;
    positioned.current = false;
  }, [activeNavigationIntent]);
  useEffect(() => {
    if (
      view !== "details" ||
      !activeNavigationIntent ||
      !["search", "current", "target"].includes(activeNavigationIntent.kind)
    )
      return;
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    next.delete("section");
    setSearchParams(next, { replace: true, state: location.state });
  }, [activeNavigationIntent, location.state, searchParams, setSearchParams, view]);

  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ ...tripQueries.itinerary(tripId), enabled: Boolean(tripId) });
  const costsQuery = useQuery({ ...tripQueries.costs(tripId), enabled: Boolean(tripId) });
  const bookingsQuery = useQuery({ ...tripQueries.bookings(tripId), enabled: Boolean(tripId) });
  const flightsQuery = useQuery({
    ...tripQueries.flights(tripId, bookingsQuery.data),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess
  });
  const journeysQuery = useQuery({
    ...tripQueries.journeys(tripId, bookingsQuery.data),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess
  });
  const cabJourneyIds = (journeysQuery.data ?? [])
    .filter((leg) => leg.mode === "cab")
    .map((leg) => leg.id);
  const cabStopsQuery = useQuery({
    queryKey: ["cab-stops", tripId, cabJourneyIds],
    queryFn: () => listCabStopsForTrip(tripId, cabJourneyIds),
    enabled: Boolean(tripId) && journeysQuery.isSuccess && cabJourneyIds.length > 0
  });
  const flightIds = (flightsQuery.data ?? []).map((flight) => flight.id);
  const flightTravelersQuery = useQuery({
    queryKey: ["flight-travelers", tripId, flightIds],
    queryFn: () => listTripFlightTravelers(tripId, flightIds),
    enabled: Boolean(tripId) && flightsQuery.isSuccess,
    staleTime: 5 * 60_000
  });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ ...tripQueries.members(tripId), enabled: Boolean(tripId) });
  const documentsQuery = useQuery({ ...tripQueries.documents(tripId), enabled: Boolean(tripId) });
  const requirementsQuery = useQuery({
    ...tripQueries.requirements(tripId),
    enabled: Boolean(tripId)
  });
  const notesQuery = useQuery({ ...tripQueries.notes(tripId), enabled: Boolean(tripId) });
  const archivedItemsQuery = useQuery({
    queryKey: ["archived-trip-items", tripId],
    queryFn: () => listArchivedTripItems(tripId),
    enabled: Boolean(tripId) && navigator.onLine
  });
  const itineraryIds = (itineraryQuery.data ?? []).map((item) => item.id);
  const bookingIds = (bookingsQuery.data ?? []).map((item) => item.id);
  const requirementIds = (requirementsQuery.data ?? []).map((item) => item.id);
  const eventDocumentReferencesQuery = useQuery({
    ...tripQueries.eventDocumentReferences(tripId, itineraryIds),
    enabled: Boolean(tripId) && itineraryQuery.isSuccess
  });
  const participantsQuery = useQuery({
    queryKey: ["itinerary-participants", tripId, itineraryIds],
    queryFn: () => listTripItineraryParticipants(tripId, itineraryIds),
    enabled: Boolean(tripId) && itineraryQuery.isSuccess
  });
  const bookingTravelersQuery = useQuery({
    queryKey: ["booking-travelers", tripId, bookingIds],
    queryFn: () => listTripBookingTravelers(tripId, bookingIds),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess
  });
  const requirementAssigneesQuery = useQuery({
    queryKey: ["requirement-assignees", tripId, requirementIds],
    queryFn: () => listTripRequirementAssignees(tripId, requirementIds),
    enabled: Boolean(tripId) && requirementsQuery.isSuccess
  });
  const trip = tripQuery.data;
  const travelers = travelersQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const role = members.find((member) => member.user_id === userId)?.role as MemberRole | undefined;
  const editable = role === "owner" || role === "editor";
  const isOwner = role === "owner";
  const itinerary = itineraryQuery.data ?? [];
  const costs = costsQuery.data ?? [];
  const bookings = bookingsQuery.data ?? [];
  const flights = flightsQuery.data ?? [];
  const flightTravelers = flightTravelersQuery.data ?? [];
  const journeys = journeysQuery.data ?? [];
  const cabStops = cabStopsQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const requirements = requirementsQuery.data ?? [];
  const participantRows = participantsQuery.data ?? [];
  const focusedWorkspace = useMemo(
    () =>
      filterTravelerWorkspace({
        travelerId: focusedTravelerId,
        itinerary,
        participants: participantRows,
        bookings,
        bookingTravelers: bookingTravelersQuery.data ?? [],
        costs,
        requirements: focusedTravelerId && !requirementAssigneesQuery.isSuccess ? [] : requirements,
        requirementAssignees: requirementAssigneesQuery.data ?? [],
        documents
      }),
    [
      focusedTravelerId,
      itinerary,
      participantRows,
      bookings,
      bookingTravelersQuery.data,
      costs,
      requirements,
      requirementAssigneesQuery.data,
      requirementAssigneesQuery.isSuccess,
      documents
    ]
  );
  const visibleItinerary = useMemo(
    () => sortTimelineItems(focusedWorkspace.itinerary),
    [focusedWorkspace.itinerary]
  );
  const visibleBookings = focusedWorkspace.bookings;
  const visibleCosts = focusedWorkspace.costs;
  const visibleRequirements = focusedWorkspace.requirements;
  const focusedDocuments = focusedWorkspace.documents;
  const viewingItinerary = routedEventId
    ? visibleItinerary.find((item) => item.id === routedEventId)
    : undefined;
  const viewingItineraryIndex = viewingItinerary
    ? itinerary.findIndex((item) => item.id === viewingItinerary.id)
    : -1;
  const timelineEntries = useMemo(
    () =>
      buildTripTimelineEntries(
        visibleItinerary,
        visibleRequirements,
        trip?.primary_timezone ?? "UTC"
      ),
    [visibleItinerary, visibleRequirements, trip?.primary_timezone]
  );
  const activeTimelineEntry = useMemo(
    () => resolveCurrentTripTimelineEntry(timelineEntries),
    [timelineEntries]
  );
  const readiness = useMemo(() => readinessSummary(visibleRequirements), [visibleRequirements]);
  const balances = useMemo(
    () =>
      calculateTripBalances(visibleCosts).filter(
        (balance) => !focusedTravelerId || balance.travelerId === focusedTravelerId
      ),
    [visibleCosts, focusedTravelerId]
  );
  const focusedTraveler = focusedTravelerId
    ? travelers.find((traveler) => traveler.id === focusedTravelerId)
    : undefined;
  const results = useMemo(
    () =>
      searchTrip({
        query,
        tripId,
        itinerary: visibleItinerary,
        bookings: visibleBookings,
        flights,
        journeys,
        documents: focusedDocuments,
        travelers: focusedTraveler ? [focusedTraveler] : travelers,
        requirements: visibleRequirements
      }),
    [
      query,
      tripId,
      visibleItinerary,
      visibleBookings,
      flights,
      journeys,
      focusedDocuments,
      focusedTraveler,
      travelers,
      visibleRequirements
    ]
  );
  const phaseJumps = useMemo(() => {
    const firstByPhase = new Map<TimelinePhase, TripTimelineEntry>();
    for (const entry of timelineEntries) {
      const phase = timelineEntryPhase(entry);
      if (!firstByPhase.has(phase)) firstByPhase.set(phase, entry);
    }
    return (["past", "current", "future", "unscheduled"] as const).flatMap((phase) =>
      firstByPhase.has(phase) ? [{ phase, entry: firstByPhase.get(phase)! }] : []
    );
  }, [timelineEntries]);

  useEffect(() => {
    if (positioned.current || !tripQuery.isSuccess) return;
    if (
      view === "details" &&
      activeNavigationIntent &&
      ["search", "current", "target"].includes(activeNavigationIntent.kind)
    )
      return;
    if (
      view === "timeline" &&
      (!itineraryQuery.isSuccess ||
        participantsQuery.isLoading ||
        bookingTravelersQuery.isLoading ||
        requirementAssigneesQuery.isLoading)
    )
      return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        if (view === "details") {
          const requested = requestedSection ? document.getElementById(requestedSection) : null;
          if (requested)
            requested.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" });
          else if (
            (activeNavigationIntent?.kind === "restore" || returningToEntry) &&
            !restoreScroll(tripId, "details")
          )
            window.scrollTo({ top: 0, behavior: "auto" });
        } else if (activeNavigationIntent?.kind === "search") {
          searchRegionRef.current?.scrollIntoView({
            behavior: preferredScrollBehavior(),
            block: "start"
          });
          searchInputRef.current?.focus({ preventScroll: true });
        } else {
          const requestedId =
            requestedTimelineItem.current ??
            (activeNavigationIntent?.kind === "target"
              ? (activeNavigationIntent.targetId ?? null)
              : null);
          if (requestedId && scrollTimelineEventIntoView(requestedId, preferredScrollBehavior()))
            requestedTimelineItem.current = null;
          else if (
            (activeNavigationIntent?.kind === "restore" || returningToEntry) &&
            restoreScroll(tripId, "timeline")
          ) {
            // The saved anchor has priority when returning from a child or switching tabs.
          } else if (activeTimelineEntry)
            scrollTimelineEventIntoView(activeTimelineEntry.id, preferredScrollBehavior());
        }
        if (activeNavigationIntent) consumeTripNavigationIntent(activeNavigationIntent);
        positioned.current = true;
        markBrowserTripEntry(location.state, tripId, view);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [
    activeTimelineEntry,
    activeNavigationIntent,
    bookingTravelersQuery.isLoading,
    itineraryQuery.isSuccess,
    location.state,
    participantsQuery.isLoading,
    requestedSection,
    requirementAssigneesQuery.isLoading,
    returningToEntry,
    tripId,
    tripQuery.isSuccess,
    view
  ]);
  useEffect(() => {
    let frame = 0;
    const record = () => {
      if (!positioned.current) return;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => saveScroll(tripId, view));
    };
    window.addEventListener("scroll", record, { passive: true });
    return () => {
      window.removeEventListener("scroll", record);
      window.cancelAnimationFrame(frame);
      if (positioned.current) saveScroll(tripId, view);
    };
  }, [tripId, view]);
  useEffect(() => {
    if (
      focusedTravelerId &&
      travelersQuery.data &&
      !travelers.some((traveler) => traveler.id === focusedTravelerId)
    )
      setFocusedTravelerId(null);
  }, [focusedTravelerId, travelersQuery.data, travelers]);

  const closeRouteModal = (keys: string[]) => {
    if (isTripRouteModal(location.state, tripId)) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(searchParams);
    keys.forEach((key) => next.delete(key));
    setSearchParams(next, {
      replace: true,
      state: tripEntryNavigationState(location.state, tripId, view)
    });
  };
  const openEvent = (itemId: string) => {
    saveScroll(tripId, view);
    const next = new URLSearchParams(searchParams);
    next.delete("add");
    next.delete("eventType");
    next.set("event", itemId);
    setSearchParams(next, {
      state: tripRouteModalNavigationState(location.state, tripId, view)
    });
  };
  const openAddEvent = () => {
    saveScroll(tripId, view);
    setOpenForm("event");
    const next = new URLSearchParams(searchParams);
    next.delete("event");
    next.delete("eventType");
    next.set("add", "event");
    setSearchParams(next, {
      state: tripRouteModalNavigationState(location.state, tripId, view)
    });
  };
  const changeAddEventType = (nextType: TimelineEventType | null) => {
    const next = new URLSearchParams(searchParams);
    next.set("add", "event");
    if (nextType) next.set("eventType", nextType);
    else next.delete("eventType");
    setSearchParams(next, { replace: true, state: location.state });
  };

  const chooseTraveler = (id: string | null) => {
    saveScroll(tripId, view);
    setFocusedTravelerId(id);
    writeTravelerFocus(tripId, id);
    if (routedEventId) {
      const next = new URLSearchParams(searchParams);
      next.delete("event");
      setSearchParams(next, { replace: true, state: location.state });
    }
    setShowingExpenses(false);
    setViewingCost(null);
    setCostReturnEventId(null);
    setCostReturnsToExpenses(false);
    setTravelerAnnouncement(
      id
        ? `Showing ${travelers.find((traveler) => traveler.id === id)?.display_name ?? "selected traveler"}`
        : "Showing everyone"
    );
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => restoreScroll(tripId, view))
    );
  };
  const changeView = (next: TripView) => {
    if (next === view) return;
    saveScroll(tripId, view);
    positioned.current = false;
    const nextParams = new URLSearchParams(searchParams);
    if (next === "details") nextParams.set("view", "details");
    else {
      nextParams.delete("view");
      nextParams.delete("section");
    }
    setSearchParams(nextParams, { state: tripEntryNavigationState(location.state, tripId, next) });
  };
  const openCurrentTimeline = () => {
    if (activeTimelineEntry) requestedTimelineItem.current = activeTimelineEntry.id;
    saveScroll(tripId, view);
    positioned.current = false;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("view");
    nextParams.delete("section");
    setSearchParams(nextParams, {
      state: tripIntentNavigationState(location.state, tripId, "current", { view: "timeline" })
    });
  };
  const openAgenda = () => {
    saveScroll(tripId, view);
    const next = new URLSearchParams(searchParams);
    next.set("agenda", "open");
    setSearchParams(next, {
      state: tripRouteModalNavigationState(location.state, tripId, view)
    });
  };
  const selectAgendaEntry = (id: string) => {
    requestedTimelineItem.current = id;
    positioned.current = false;
    const next = new URLSearchParams(searchParams);
    next.delete("agenda");
    next.delete("view");
    next.delete("section");
    setSearchParams(next, {
      replace: true,
      state: tripIntentNavigationState(null, tripId, "target", {
        view: "timeline",
        targetId: id
      })
    });
  };
  const closeForm = () => {
    const closingRouteEvent = openForm === "event" && requestedForm === "event";
    setOpenForm(null);
    setCostTargetItem(null);
    setDocumentTargetItem(null);
    setDocumentToAttach(null);
    if (closingRouteEvent) {
      closeRouteModal(["add", "eventType"]);
      return;
    }
    if (!searchParams.has("add")) return;
    const next = new URLSearchParams(searchParams);
    next.delete("add");
    next.delete("eventType");
    setSearchParams(next, {
      replace: true,
      state: tripEntryNavigationState(location.state, tripId, view)
    });
  };
  const openPeople = (trigger: HTMLButtonElement) => {
    peopleTriggerRef.current = trigger;
    setOpenForm("people");
  };
  const closePeople = () => {
    closeForm();
    window.requestAnimationFrame(() => peopleTriggerRef.current?.focus());
  };
  const selectTraveler = (id: string | null) => {
    chooseTraveler(id);
    closePeople();
  };
  const scrollToItem = (id: string) => {
    setQuery("");
    requestedTimelineItem.current = id;
    positioned.current = false;
    if (view === "timeline") {
      window.requestAnimationFrame(() => {
        if (scrollTimelineEventIntoView(id, preferredScrollBehavior())) {
          requestedTimelineItem.current = null;
          positioned.current = true;
          markBrowserTripEntry(location.state, tripId, view);
        }
      });
    } else changeView("timeline");
  };
  const openExpenses = () => setShowingExpenses(true);
  const closeCostDetails = () => {
    const returnEventId = costReturnEventId;
    const returnToExpenses = costReturnsToExpenses;
    setViewingCost(null);
    setCostReturnEventId(null);
    setCostReturnsToExpenses(false);
    if (!returnEventId && returnToExpenses) setShowingExpenses(true);
  };
  const editTimelineItem = (item: ItineraryItem) => {
    const linkedBooking = item.booking_id
      ? bookings.find((booking) => booking.id === item.booking_id)
      : undefined;
    if (
      linkedBooking?.type === "hotel" &&
      (item.event_type === "hotel_check_in" || item.event_type === "hotel_check_out")
    ) {
      setEditingBooking(linkedBooking);
      return;
    }
    setEditingItinerary(item);
  };

  const archiveItinerary = useMutation({
    mutationFn: archiveItineraryItem,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["bookings", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] })
      ]);
    }
  });
  const reorderItinerary = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) =>
      reorderItineraryItems(itinerary, itemId, direction),
    onSuccess: (items) => queryClient.setQueryData(["itinerary", tripId], items)
  });
  const updateEventStatus = useMutation({
    mutationFn: ({ item, status }: { item: ItineraryItem; status: EventStatus }) =>
      setItineraryItemStatus(item, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] })
  });
  const updateTimelineRequirement = useMutation({
    mutationFn: ({
      requirement,
      status
    }: {
      requirement: Requirement;
      status: RequirementStatus;
    }) => updateRequirementStatus(requirement.id, status, tripId),
    onMutate: async ({ requirement, status }) => {
      await queryClient.cancelQueries({ queryKey: ["requirements", tripId] });
      const previous = queryClient.getQueryData<Requirement[]>(["requirements", tripId]);
      queryClient.setQueryData<Requirement[]>(["requirements", tripId], (items = []) =>
        items.map((item) => (item.id === requirement.id ? { ...item, status } : item))
      );
      return { previous };
    },
    onError: (_error, _input, context) =>
      queryClient.setQueryData(["requirements", tripId], context?.previous),
    onSuccess: (_data, { requirement, status }) => {
      setTimelineStatus(
        status === "complete"
          ? `${requirement.title} marked done. The next item is now highlighted.`
          : `${requirement.title} reopened.`
      );
      if (status === "complete") setAdvanceAfterRequirementId(requirement.id);
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["requirements", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] })
      ]);
    }
  });
  const archiveCost = useMutation({
    mutationFn: archiveTripCost,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["costs", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] })
      ]);
    }
  });
  const updateExpenseSplitting = useMutation({
    mutationFn: ({ trip: currentTrip, enabled }: { trip: Trip; enabled: boolean }) =>
      updateTripExpenseSplitting(currentTrip, enabled),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], updated);
      queryClient.setQueryData<Trip[]>(["trips"], (items) =>
        items?.map((item) => (item.id === updated.id ? updated : item))
      );
    }
  });
  const restoreArchivedItem = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: "event" | "booking" | "cost" }) =>
      kind === "cost" ? restoreTripCost(id) : restoreItineraryItem(id),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["bookings", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["costs", tripId] })
      ]);
    }
  });
  const removeTravelerMutation = useMutation({
    mutationFn: removeTraveler,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["travelers", tripId] })
  });
  const archiveNoteMutation = useMutation({
    mutationFn: archiveNote,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", tripId] })
  });

  useEffect(() => {
    if (
      !advanceAfterRequirementId ||
      !activeTimelineEntry ||
      activeTimelineEntry.id === `requirement:${advanceAfterRequirementId}`
    )
      return;
    const frame = window.requestAnimationFrame(() =>
      scrollTimelineEventIntoView(activeTimelineEntry.id, preferredScrollBehavior())
    );
    setAdvanceAfterRequirementId(null);
    return () => window.cancelAnimationFrame(frame);
  }, [activeTimelineEntry, advanceAfterRequirementId]);

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl pb-24">
        <Link
          to="/trips"
          className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"
        >
          <ArrowLeft className="size-4" /> All trips
        </Link>
        {tripQuery.isLoading && <LoadingCard />}
        {tripQuery.error && (
          <ErrorCard error={tripQuery.error} title="This trip could not be opened" />
        )}
        {trip && (
          <>
            <header className="page-enter mt-4 rounded-[2rem] bg-brand p-5 text-surface shadow-focus sm:p-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-surface/60">
                    {formatDateRange(trip.start_date, trip.end_date)}
                  </p>
                  <h1 className="mt-2 font-display text-3xl font-black tracking-[-.05em] sm:text-4xl">
                    {trip.title}
                  </h1>
                  <p className="mt-2 flex items-center gap-2 text-sm text-surface/70">
                    <MapPin className="size-4" />
                    {trip.destination_summary}
                  </p>
                </div>
                <span className="rounded-full bg-surface/10 px-3 py-2 text-xs font-bold capitalize">
                  {role ?? "member"}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 rounded-2xl bg-surface/10 p-1">
                <button
                  type="button"
                  onClick={() => changeView("timeline")}
                  className={`tap-target rounded-xl text-sm font-black ${view === "timeline" ? "bg-surface text-brand shadow-soft" : "text-surface/70"}`}
                >
                  Timeline
                </button>
                <button
                  type="button"
                  onClick={() => changeView("details")}
                  className={`tap-target rounded-xl text-sm font-black ${view === "details" ? "bg-surface text-brand shadow-soft" : "text-surface/70"}`}
                >
                  Trip details
                </button>
              </div>
              <button
                type="button"
                onClick={openExpenses}
                className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl bg-surface/10 px-3 py-2 text-left transition hover:bg-surface/15 focus-visible:ring-2 focus-visible:ring-surface motion-reduce:transition-none"
                aria-label="Open trip expenses"
              >
                <CompactCostTotal
                  costs={visibleCosts}
                  emptyText="Add your first trip cost"
                  inverse
                />
                <ChevronRight className="size-4 shrink-0 text-surface/60" />
              </button>
            </header>
            <div
              ref={searchRegionRef}
              id="trip-search"
              role="search"
              aria-label="Search within this trip"
              className="relative mt-4 scroll-mt-[calc(6rem+env(safe-area-inset-top))]"
            >
              <Search className="pointer-events-none absolute left-4 top-3.5 size-5 text-muted" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="form-input mt-0 pl-12 pr-11"
                placeholder="Search timeline, PNR, airport, document, traveler…"
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
                <div className="relative z-40 mt-2 max-h-[42dvh] w-full scroll-mb-[45dvh] overflow-auto rounded-2xl border border-line bg-surface p-2 shadow-focus sm:absolute sm:max-h-96 sm:scroll-mb-0">
                  {results.map((result) =>
                    result.href ? (
                      <Link
                        key={result.id}
                        to={result.href}
                        state={childNavigationState}
                        onClick={() => setQuery("")}
                        className="block rounded-xl px-3 py-3 hover:bg-elevated"
                      >
                        <strong className="block text-sm">{result.title}</strong>
                        <span className="text-xs text-muted">
                          {result.group} · {result.detail}
                        </span>
                      </Link>
                    ) : (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => {
                          if (result.timelineItemId) scrollToItem(result.timelineItemId);
                          else if (result.group === "Travelers") {
                            chooseTraveler(result.id.replace("traveler:", ""));
                            setQuery("");
                          }
                        }}
                        className="block w-full rounded-xl px-3 py-3 text-left hover:bg-elevated"
                      >
                        <strong className="block text-sm">{result.title}</strong>
                        <span className="text-xs text-muted">
                          {result.group} · {result.detail}
                        </span>
                      </button>
                    )
                  )}
                  {results.length === 0 && (
                    <p className="p-4 text-sm text-muted">Nothing in this trip matches.</p>
                  )}
                </div>
              )}
            </div>

            {view === "timeline" ? (
              <main className="mt-5">
                <section
                  id="timeline-readiness"
                  data-trip-scroll-anchor="timeline"
                  className="surface-card group relative overflow-hidden p-5 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft sm:p-6 motion-reduce:hover:translate-y-0"
                >
                  <Link
                    className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-brand"
                    to={`/trips/${trip.id}/readiness`}
                    state={childNavigationState}
                    aria-label="Open trip readiness"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="eyebrow">Before you go</p>
                      <h2 className="mt-1 font-display text-xl font-black">Readiness checklist</h2>
                    </div>
                    <ShieldCheck
                      className={`size-6 ${readiness.remaining ? "text-warning" : "text-success"}`}
                    />
                  </div>
                  {readiness.total ? (
                    <>
                      <p className="mt-3 text-sm text-muted">
                        {readiness.resolved} of {readiness.total} tasks done
                      </p>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated">
                        <span
                          className="block h-full rounded-full bg-success transition-all"
                          style={{
                            width: `${Math.round((readiness.resolved / readiness.total) * 100)}%`
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-muted">
                      Add the first thing you need to do before this trip.
                    </p>
                  )}
                  <div className="relative z-20 mt-4 flex gap-4">
                    <Link
                      className="text-sm font-extrabold text-brand"
                      to={`/trips/${trip.id}/readiness`}
                      state={childNavigationState}
                    >
                      Open checklist
                    </Link>
                    {editable && (
                      <button
                        type="button"
                        className="text-sm font-extrabold text-brand"
                        onClick={() => setOpenForm("requirement")}
                      >
                        + Add task
                      </button>
                    )}
                  </div>
                </section>
                <section className="surface-card mt-5 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="eyebrow">Everything in order</p>
                      <h2 className="mt-1 font-display text-2xl font-black">
                        {focusedTraveler
                          ? `${focusedTraveler.display_name}'s timeline`
                          : "Complete timeline"}
                      </h2>
                      <p className="mt-2 text-sm text-muted">
                        {focusedTraveler
                          ? "Shared events and this traveler's events are shown in time order."
                          : "Past events are above you. Upcoming events continue below."}
                      </p>
                    </div>
                    {visibleItinerary.length > 0 && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => downloadTripCalendar(trip, visibleItinerary)}
                      >
                        <Download className="size-4" /> Calendar
                      </button>
                    )}
                  </div>
                  {timelineStatus && (
                    <p
                      role="status"
                      className="mt-4 rounded-xl bg-success/10 p-3 text-sm font-bold text-success"
                    >
                      {timelineStatus}
                    </p>
                  )}
                  {phaseJumps.length > 0 && (
                    <nav
                      aria-label="Timeline sections"
                      className="sticky top-2 z-30 mt-4 flex gap-2 overflow-auto rounded-2xl border border-line bg-surface/95 p-2 shadow-soft backdrop-blur"
                    >
                      {phaseJumps.map(({ phase, entry }) => (
                        <button
                          key={phase}
                          type="button"
                          onClick={() => scrollToItem(entry.id)}
                          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${phase === "current" ? "bg-coral text-white" : "bg-elevated text-brand"}`}
                        >
                          {phaseLabels[phase]}
                        </button>
                      ))}
                    </nav>
                  )}
                  <div className="relative mt-6 before:absolute before:bottom-5 before:left-1 before:top-5 before:w-px before:bg-line xl:before:left-[8.25rem]">
                    {timelineEntries.map((entry, index, entries) => {
                      const current = activeTimelineEntry?.id === entry.id;
                      const phase = timelineEntryPhase(entry);
                      const previousPhase = index ? timelineEntryPhase(entries[index - 1]) : null;
                      const showDate =
                        index === 0 ||
                        itineraryDateKey(
                          entries[index - 1].startsAt,
                          entries[index - 1].timezone
                        ) !== itineraryDateKey(entry.startsAt, entry.timezone);
                      if (entry.kind === "requirement") {
                        const item = entry.requirement;
                        const done = ["complete", "not_required"].includes(item.status);
                        const audience = requirementAudienceLabel(
                          item.id,
                          requirementAssigneesQuery.data ?? [],
                          travelers
                        );
                        return (
                          <Fragment key={entry.id}>
                            {phase !== previousPhase && (
                              <div
                                id={`timeline-phase-${phase}`}
                                className={`${index ? "pt-7" : ""} relative z-10 pb-3 pl-6 xl:pl-[10.5rem]`}
                              >
                                <span
                                  className={`inline-flex rounded-full px-3 py-1.5 text-[.65rem] font-black uppercase tracking-[.14em] ${current ? "bg-coral text-white" : "border border-line bg-surface text-muted"}`}
                                >
                                  {current ? "Needs attention" : phaseLabels[phase]}
                                </span>
                              </div>
                            )}
                            {showDate && (
                              <h3
                                className={`${index ? "pt-3" : ""} pb-3 pl-6 text-sm font-black xl:pl-[10.5rem]`}
                              >
                                {formatItineraryDate(entry.startsAt, entry.timezone)}
                              </h3>
                            )}
                            <div
                              id={`timeline-${entry.id}`}
                              data-trip-scroll-anchor="timeline"
                              className="relative mb-3 grid scroll-mt-28 grid-cols-1 pl-5 xl:grid-cols-[6rem_2.5rem_minmax(0,1fr)] xl:gap-4 xl:pl-0"
                            >
                              <span
                                aria-hidden="true"
                                className={`absolute left-[-0.05rem] top-5 z-10 size-2.5 rounded-full ring-4 ring-surface xl:hidden ${current ? "bg-coral" : done || phase === "past" ? "bg-line" : "bg-brand"}`}
                              />
                              <time
                                className={`hidden pt-3 text-right text-xs font-black xl:block ${current ? "text-coral" : "text-muted"}`}
                              >
                                {formatEventTime(entry.startsAt, entry.timezone).split(",").at(-1)}
                              </time>
                              <span
                                className={`z-10 mt-2 hidden size-10 place-items-center rounded-full border-4 border-surface xl:grid ${current ? "bg-coral text-white shadow-focus" : done || phase === "past" ? "bg-line text-muted" : "bg-brand-soft text-brand"}`}
                              >
                                <Check className="size-4" />
                              </span>
                              <div
                                className={`flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2 transition xl:px-4 ${current ? "border-coral bg-coral/10 shadow-focus" : "border-line bg-elevated"}`}
                              >
                                <input
                                  type="checkbox"
                                  className="relative z-10 size-5 shrink-0 accent-brand"
                                  checked={done}
                                  disabled={!editable || updateTimelineRequirement.isPending}
                                  aria-label={`${done ? "Mark as not done" : "Mark as done"}: ${item.title}`}
                                  onChange={(event) =>
                                    updateTimelineRequirement.mutate({
                                      requirement: item,
                                      status: event.target.checked ? "complete" : "to_check"
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => setViewingRequirement(item)}
                                  className="min-w-0 flex-1 rounded-lg text-left focus-visible:ring-2 focus-visible:ring-brand"
                                  aria-label={`View details for ${item.title}`}
                                >
                                  <strong
                                    className={`block truncate text-sm ${done ? "text-muted line-through" : "text-ink"}`}
                                  >
                                    {item.title}
                                  </strong>
                                  <span className="mt-0.5 block text-xs text-muted">
                                    {entry.scheduleLabel}
                                    {audience ? ` · ${audience}` : ""}
                                    {done ? " · Done" : " · Readiness task"}
                                  </span>
                                </button>
                                {current && !done && (
                                  <span className="shrink-0 rounded-full bg-coral px-2 py-1 text-[.6rem] font-black uppercase text-white">
                                    Next
                                  </span>
                                )}
                              </div>
                            </div>
                          </Fragment>
                        );
                      }
                      const item = entry.item;
                      const booking = item.booking_id
                        ? visibleBookings.find((row) => row.id === item.booking_id)
                        : undefined;
                      const end = eventEndDetails(item);
                      const endTimeZone = eventEndTimeZone(item, flights, journeys);
                      const timingLabel = eventTimeLabel(item, visibleItinerary);
                      const plannedDuration = plannedDurationLabel(item);
                      const explicitStart = hasExplicitEventStart(item);
                      const compactTimingLabel =
                        item.timing_mode === "relative"
                          ? explicitStart
                            ? formatEventTime(item.starts_at, item.timezone).split(",").at(-1)
                            : item.relative_position === "before"
                              ? "Before"
                              : "After"
                          : (timingLabel ??
                            formatEventTime(item.starts_at, item.timezone).split(",").at(-1));
                      const map = mapsUrl(item.location);
                      const travelerIds = participantRows
                        .filter((row) => row.itinerary_item_id === item.id)
                        .map((row) => row.traveler_id);
                      return (
                        <Fragment key={item.id}>
                          {phase !== previousPhase && (
                            <div
                              id={`timeline-phase-${phase}`}
                              className={`${index ? "pt-7" : ""} relative z-10 pb-3 pl-6 xl:pl-[10.5rem]`}
                            >
                              <span
                                className={`inline-flex rounded-full px-3 py-1.5 text-[.65rem] font-black uppercase tracking-[.14em] ${phase === "current" ? "bg-coral text-white" : "border border-line bg-surface text-muted"}`}
                              >
                                {phaseLabels[phase]}
                              </span>
                            </div>
                          )}
                          {item.timing_mode !== "unscheduled" && showDate && (
                            <h3
                              className={`${index ? "pt-3" : ""} pb-3 pl-6 text-sm font-black xl:pl-[10.5rem]`}
                            >
                              {formatItineraryDate(item.starts_at, item.timezone)}
                            </h3>
                          )}
                          <div
                            id={`timeline-${item.id}`}
                            data-trip-scroll-anchor="timeline"
                            className="relative mb-4 grid scroll-mt-28 grid-cols-1 pl-5 xl:grid-cols-[6rem_2.5rem_minmax(0,1fr)] xl:gap-4 xl:pl-0"
                          >
                            <span
                              aria-hidden="true"
                              className={`absolute left-[-0.05rem] top-6 z-10 size-2.5 rounded-full ring-4 ring-surface xl:hidden ${current ? "bg-coral" : phase === "past" ? "bg-line" : "bg-brand"}`}
                            />
                            <time
                              className={`hidden pt-4 text-right text-xs font-black xl:block ${current ? "text-coral" : "text-muted"}`}
                            >
                              {compactTimingLabel}
                            </time>
                            <EventTypeIcon
                              type={item.event_type ?? "custom"}
                              iconClassName="size-4"
                              className={`z-10 mt-3 hidden size-10 rounded-full border-4 border-surface xl:grid ${current ? "shadow-focus ring-2 ring-coral/40" : phase === "past" ? "opacity-60" : ""}`}
                            />
                            <FocusSurface
                              active={current}
                              className={`group p-4 pr-16 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft xl:p-5 ${current ? "bg-coral/10" : "bg-elevated"}`}
                            >
                              <button
                                type="button"
                                className="absolute inset-0 z-10 cursor-pointer rounded-[1.6rem] focus-visible:ring-2 focus-visible:ring-brand"
                                onClick={() => openEvent(item.id)}
                                aria-label={`Open details for ${item.title}`}
                              />
                              <EventTypeIcon
                                type={item.event_type ?? "custom"}
                                iconClassName="size-4"
                                className={`absolute right-4 top-4 size-10 rounded-xl xl:hidden ${current ? "ring-2 ring-coral/40" : phase === "past" ? "opacity-60" : ""}`}
                              />
                              <time
                                className={`text-xs font-black xl:hidden ${current ? "text-coral" : "text-muted"}`}
                              >
                                {compactTimingLabel}
                              </time>
                              <div className="min-w-0">
                                <span
                                  className={`mb-2 inline-flex rounded-full px-2 py-1 text-[.6rem] font-black uppercase tracking-[.12em] ${current ? "bg-coral text-white" : "bg-surface text-muted"}`}
                                >
                                  {phaseForActive(item, current)}
                                </span>
                                <h3 className="font-display text-lg font-black">{item.title}</h3>
                                {item.timing_mode === "relative" && (
                                  <p className="mt-1 text-xs font-extrabold text-brand">
                                    {timingLabel}
                                  </p>
                                )}
                                {item.timing_mode === "relative" && explicitStart && (
                                  <p className="mt-1 text-xs text-muted">
                                    Starts {formatEventTime(item.starts_at, item.timezone)}
                                  </p>
                                )}
                                <p className="mt-1 text-xs capitalize text-muted">
                                  {(item.event_type ?? "custom").replaceAll("_", " ")} ·{" "}
                                  {(item.event_status ?? "planned").replaceAll("_", " ")}
                                </p>
                                {end && (
                                  <p className="mt-1 text-xs text-muted">
                                    {end.journey ? "Arrives" : "Ends"}{" "}
                                    {formatEventTime(end.endsAt, endTimeZone)} · {end.duration}
                                  </p>
                                )}
                                {plannedDuration && (
                                  <p className="mt-1 text-xs text-muted">
                                    Planned duration · {plannedDuration}
                                  </p>
                                )}
                              </div>
                              <EventTravelers
                                item={item}
                                travelerIds={travelerIds}
                                travelers={travelers}
                              />
                              {item.location?.label && (
                                <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                                  <MapPin className="mt-0.5 size-4 shrink-0" />
                                  {item.location.label}
                                </p>
                              )}
                              <div className="relative z-20 mt-3 flex flex-wrap items-center gap-3">
                                {map ? (
                                  <a
                                    href={map}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 text-xs font-extrabold text-brand"
                                  >
                                    <LocateFixed className="size-4" /> Navigation
                                  </a>
                                ) : editable && !isJourneyEventType(item.event_type) ? (
                                  <button
                                    type="button"
                                    onClick={() => editTimelineItem(item)}
                                    className="inline-flex items-center gap-1.5 text-xs font-extrabold text-warning"
                                  >
                                    <MapPin className="size-4" /> Add location
                                  </button>
                                ) : null}
                                <EventDocumentShortcut
                                  item={item}
                                  travelerId={focusedTravelerId}
                                  navigationState={childNavigationState}
                                />
                              </div>
                              {booking && (
                                <BookingEventSummary
                                  tripId={trip.id}
                                  booking={booking}
                                  flights={flights}
                                  flightTravelers={flightTravelers}
                                  journeys={journeys}
                                  travelers={travelers}
                                  focusedTravelerId={focusedTravelerId}
                                  cabStops={cabStops}
                                  eventTimezone={item.timezone}
                                />
                              )}
                              <span className="mt-4 flex items-center justify-end gap-1 text-xs font-extrabold text-brand">
                                View details{" "}
                                <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                              </span>
                            </FocusSurface>
                          </div>
                        </Fragment>
                      );
                    })}
                    {timelineEntries.length === 0 && (
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={openAddEvent}
                        className="w-full rounded-2xl border border-dashed border-line p-8 text-sm text-muted"
                      >
                        {editable
                          ? focusedTraveler
                            ? `No events or scheduled tasks apply to ${focusedTraveler.display_name}. Add one for them.`
                            : "Your timeline is empty. Add the first event."
                          : "No relevant timeline items have been added yet."}
                      </button>
                    )}
                  </div>
                </section>
              </main>
            ) : (
              <TripDetailsView
                trip={trip}
                focusedTraveler={focusedTraveler}
                focusedTravelerId={focusedTravelerId}
                travelers={travelers}
                bookings={visibleBookings}
                flights={flights}
                journeys={journeys}
                costs={visibleCosts}
                documents={focusedDocuments}
                itinerary={visibleItinerary}
                eventDocumentReferences={eventDocumentReferencesQuery.data}
                readiness={readiness}
                archivedItems={archivedItemsQuery.data}
                notes={notesQuery.data}
                editable={editable}
                isOwner={isOwner}
                restorePending={restoreArchivedItem.isPending}
                navigationState={childNavigationState}
                online={navigator.onLine}
                onOpenSettings={() => setOpenForm("settings")}
                onAddEvent={openAddEvent}
                onOpenExpenses={openExpenses}
                onAddCost={() => {
                  setCostTargetItem(null);
                  setOpenForm("cost");
                }}
                onOpenPeople={openPeople}
                onOpenReadiness={() =>
                  navigate(`/trips/${trip.id}/readiness`, { state: childNavigationState })
                }
                onUploadDocument={() => setOpenForm("document")}
                onRestoreArchived={(item) =>
                  restoreArchivedItem.mutate({ id: item.id, kind: item.kind })
                }
                onAddNote={() => setOpenForm("note")}
                onEditNote={setEditingNote}
                onArchiveNote={async (note) => {
                  if (
                    await confirm({
                      title: "Archive note?",
                      message: "Archive this note?",
                      confirmLabel: "Archive",
                      tone: "danger"
                    })
                  ) {
                    archiveNoteMutation.mutate(note);
                  }
                }}
              />
            )}

            <p className="sr-only" role="status" aria-live="polite">
              {travelerAnnouncement}
            </p>
            <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-focus backdrop-blur lg:bottom-6">
              {editable && (
                <button
                  type="button"
                  onClick={openAddEvent}
                  className="primary-button min-h-11 whitespace-nowrap px-3 sm:px-4"
                  aria-label="Add event"
                >
                  <CalendarPlus className="size-4" />
                  <span>Add event</span>
                </button>
              )}
              <button
                type="button"
                onClick={openAgenda}
                className="secondary-button relative size-11 justify-center px-0 sm:size-auto sm:px-4"
                aria-label="Open trip agenda"
              >
                <ListTree className="size-4" />
                <span className="hidden sm:inline">Agenda</span>
                {timelineEntries.length > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[.6rem] font-black leading-5 text-white"
                  >
                    {timelineEntries.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={(event) => openPeople(event.currentTarget)}
                className="secondary-button size-11 justify-center px-0 sm:size-auto sm:px-4"
                aria-label={`People and sharing · ${focusedTraveler?.display_name ?? "Everyone"}`}
              >
                {focusedTraveler ? (
                  <span className="grid size-6 place-items-center rounded-full bg-brand text-[.55rem] font-black text-surface">
                    {focusedTraveler.display_name.slice(0, 2).toUpperCase()}
                  </span>
                ) : (
                  <UsersRound className="size-4" />
                )}
                <span className="hidden max-w-32 truncate sm:inline">
                  {focusedTraveler?.display_name ?? "Everyone"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => (view === "details" ? openCurrentTimeline() : changeView("details"))}
                className="tap-target grid size-11 place-items-center rounded-xl border border-line text-brand"
                aria-label={view === "details" ? "Jump to current timeline" : "Open trip details"}
              >
                {view === "details" ? (
                  <CalendarClock className="size-5" />
                ) : (
                  <Info className="size-5" />
                )}
              </button>
              {view === "timeline" && activeTimelineEntry && (
                <button
                  type="button"
                  onClick={() => scrollToItem(activeTimelineEntry.id)}
                  className="tap-target hidden size-11 place-items-center rounded-xl border border-line text-brand sm:grid"
                  aria-label="Jump to now or next"
                >
                  <LocateFixed className="size-5" />
                </button>
              )}
            </div>
          </>
        )}
      </div>
      {trip && showingExpenses && (
        <TripExpensesSheet
          title={
            focusedTraveler ? `${focusedTraveler.display_name}'s trip expenses` : "Trip expenses"
          }
          costs={visibleCosts}
          balances={balances}
          travelers={travelers}
          onClose={() => {
            setShowingExpenses(false);
            setViewingCost(null);
            setCostReturnsToExpenses(false);
          }}
          onViewCost={(cost) => {
            setShowingExpenses(false);
            setCostReturnsToExpenses(true);
            setViewingCost(cost);
          }}
          expenseSplittingControl={
            editable ? (
              <>
                <label className="flex min-h-16 cursor-pointer items-center justify-between gap-4 p-4 text-sm">
                  <span>
                    <strong className="block">Enable expense splitting</strong>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      Choose specific travelers for each cost. When off, every cost applies equally
                      to everyone.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="size-5 shrink-0 accent-brand"
                    checked={Boolean(trip.expense_splitting_enabled)}
                    disabled={updateExpenseSplitting.isPending}
                    onChange={(event) =>
                      updateExpenseSplitting.mutate({ trip, enabled: event.target.checked })
                    }
                  />
                </label>
                {updateExpenseSplitting.error && (
                  <p
                    role="alert"
                    className="border-t border-line bg-danger/10 p-3 text-sm font-bold text-danger"
                  >
                    {getErrorMessage(updateExpenseSplitting.error)}
                  </p>
                )}
              </>
            ) : undefined
          }
        />
      )}
      {trip && agendaOpen && (
        <TripAgendaSheet
          entries={timelineEntries}
          activeEntryId={activeTimelineEntry?.id}
          onClose={() => closeRouteModal(["agenda"])}
          onSelect={selectAgendaEntry}
        />
      )}
      {trip &&
        viewingItinerary &&
        !editingBooking &&
        !editingItinerary &&
        !eventBookingTarget &&
        !viewingCost &&
        openForm === null && (
          <EventDetailsSheet
            item={viewingItinerary}
            itinerary={visibleItinerary}
            tripId={trip.id}
            booking={
              viewingItinerary.booking_id
                ? visibleBookings.find((booking) => booking.id === viewingItinerary.booking_id)
                : undefined
            }
            flights={flights}
            flightTravelers={flightTravelers}
            journeys={journeys}
            travelerIds={participantRows
              .filter((row) => row.itinerary_item_id === viewingItinerary.id)
              .map((row) => row.traveler_id)}
            travelers={travelers}
            costs={visibleCosts}
            tripCurrency={trip.base_currency}
            focusedTravelerId={focusedTravelerId}
            navigationState={childNavigationState}
            editable={editable}
            canMoveUp={
              viewingItinerary.timing_mode !== "relative" &&
              viewingItineraryIndex > 0 &&
              itinerary[viewingItineraryIndex - 1]?.starts_at === viewingItinerary.starts_at
            }
            canMoveDown={
              viewingItinerary.timing_mode !== "relative" &&
              viewingItineraryIndex >= 0 &&
              itinerary[viewingItineraryIndex + 1]?.starts_at === viewingItinerary.starts_at
            }
            onClose={() => closeRouteModal(["event"])}
            onEdit={() => editTimelineItem(viewingItinerary)}
            onArchive={async () => {
              if (
                await confirm({
                  title: "Archive event?",
                  message: `Archive ${viewingItinerary.title}? ${viewingItinerary.booking_id ? "Its complete booking group leaves the timeline." : "It leaves the timeline."} Linked documents and costs remain.`,
                  confirmLabel: "Archive",
                  tone: "danger"
                })
              ) {
                closeRouteModal(["event"]);
                archiveItinerary.mutate(viewingItinerary);
              }
            }}
            onAddBooking={() => setEventBookingTarget(viewingItinerary)}
            onAddCost={() => {
              setCostTargetItem(viewingItinerary);
              setOpenForm("cost");
            }}
            onViewCost={(cost) => {
              setCostReturnEventId(viewingItinerary.id);
              setCostReturnsToExpenses(false);
              setViewingCost(cost);
            }}
            onUploadDocument={() => {
              const travelerIds = participantRows
                .filter((row) => row.itinerary_item_id === viewingItinerary.id)
                .map((row) => row.traveler_id);
              setDocumentTargetItem({
                ...viewingItinerary,
                assignmentPreset: {
                  mode: viewingItinerary.applies_to_all_travelers ? "shared" : "selected",
                  travelerIds
                }
              });
              setOpenForm("document");
            }}
            onStatus={(status) => updateEventStatus.mutate({ item: viewingItinerary, status })}
            onMoveUp={() =>
              reorderItinerary.mutate({ itemId: viewingItinerary.id, direction: "up" })
            }
            onMoveDown={() =>
              reorderItinerary.mutate({ itemId: viewingItinerary.id, direction: "down" })
            }
            routeBacked
          />
        )}
      {viewingCost && (
        <CostDetailsSheet
          cost={viewingCost}
          travelers={travelers}
          itinerary={visibleItinerary}
          bookings={visibleBookings}
          editable={editable}
          onClose={closeCostDetails}
          onEdit={() => {
            setViewingCost(null);
            setCostReturnEventId(null);
            setCostReturnsToExpenses(false);
            setEditingCost(viewingCost);
          }}
          onArchive={async () => {
            if (
              await confirm({
                title: "Archive cost?",
                message: `Archive ${viewingCost.title}? You can restore it from Archived trip items.`,
                confirmLabel: "Archive",
                tone: "danger"
              })
            ) {
              archiveCost.mutate(viewingCost);
              closeCostDetails();
            }
          }}
        />
      )}
      {trip && openForm === "event" && editable && (
        <AddEventForm
          trip={trip}
          travelers={travelers}
          preferredTravelerId={focusedTravelerId ?? undefined}
          documentToAttach={documentToAttach ?? undefined}
          initialType={routedEventType}
          routeBacked
          onClose={closeForm}
          onTypeChange={changeAddEventType}
          onAddDocument={async (saved, handoff) => {
            const assignmentPreset: DocumentAssignmentPreset = {
              mode: saved.participantScope === "everyone" ? "shared" : "selected",
              travelerIds: saved.travelerIds
            };
            if (handoff?.documentId || (handoff?.file && handoff.kind)) {
              let documentId = handoff.documentId;
              if (!documentId && handoff.file && handoff.kind) {
                const kind = documentKind(handoff.kind);
                try {
                  suppressRealtimeRefresh(["documents", "account-document-uploads"], 15_000);
                  const document = await uploadDocument({
                    tripId: trip.id,
                    title: suggestedDocumentTitle(
                      handoff.kind,
                      assignmentPreset.mode,
                      assignmentPreset.travelerIds,
                      travelers,
                      saved.title
                    ),
                    category: kind.category,
                    purpose: kind.purpose,
                    assignmentMode: assignmentPreset.mode,
                    visibility: "trip",
                    travelerIds: assignmentPreset.travelerIds,
                    bookingId: saved.bookingId,
                    file: handoff.file
                  });
                  documentId = document.id;
                  queryClient.setQueryData<VaultDocument[]>(["documents", trip.id], (items) =>
                    upsertById(items, [document])
                  );
                  queryClient.setQueryData<VaultDocument[]>(["documents"], (items) =>
                    upsertById(items, [document])
                  );
                } catch (error) {
                  if (!(error instanceof DuplicateDocumentError)) throw error;
                  documentId = error.existingDocumentId;
                }
              }
              const target =
                itinerary.find((item) => item.id === saved.itineraryItemId) ??
                (await listItinerary(trip.id)).find((item) => item.id === saved.itineraryItemId);
              if (!target)
                throw new Error(
                  "The document was saved, but its new timeline event could not be linked. Open the event and attach it from there."
                );
              if (!documentId)
                throw new Error(
                  "The document was saved, but it could not be selected for the new event."
                );
              await attachDocumentsToEvent(target, [documentId]);
              await queryClient.invalidateQueries({
                queryKey: ["event-documents", saved.itineraryItemId]
              });
              await queryClient.invalidateQueries({
                queryKey: ["trip-event-documents", trip.id]
              });
              setDocumentToAttach(null);
              return;
            }
            setDocumentTargetItem({
              id: saved.itineraryItemId,
              booking_id: saved.bookingId,
              title: saved.title,
              assignmentPreset
            });
            setOpenForm("document");
          }}
        />
      )}
      {trip && openForm === "people" && (
        <PeopleSheet
          trip={trip}
          travelers={travelers}
          members={members}
          selectedId={focusedTravelerId}
          editable={editable}
          isOwner={isOwner}
          onSelect={selectTraveler}
          onEdit={(traveler) => {
            setOpenForm(null);
            setEditingTraveler(traveler);
          }}
          onAdd={() => setOpenForm("traveler")}
          onShare={() => setOpenForm("share")}
          onClose={closePeople}
          onRefresh={() => void membersQuery.refetch()}
        />
      )}
      {trip && openForm === "cost" && editable && (
        <AddCostForm
          trip={trip}
          travelers={travelers}
          bookingId={costTargetItem?.booking_id ?? undefined}
          itineraryItemId={costTargetItem?.id}
          sourceTitle={costTargetItem?.title}
          onClose={closeForm}
        />
      )}
      {trip && openForm === "document" && (
        <UploadDocumentForm
          trip={trip}
          travelers={travelers}
          preferredTravelerId={focusedTravelerId ?? undefined}
          members={members}
          privateOnly={!editable}
          bookingId={documentTargetItem?.booking_id ?? undefined}
          contextTitle={documentTargetItem?.title}
          assignmentPreset={documentTargetItem?.assignmentPreset}
          onUploaded={
            documentTargetItem
              ? async (documentId) => {
                  const target =
                    itinerary.find((item) => item.id === documentTargetItem.id) ??
                    (await listItinerary(trip.id)).find(
                      (item) => item.id === documentTargetItem.id
                    );
                  if (!target)
                    throw new Error(
                      "The document was saved, but its new timeline event could not be linked. Open the event and attach it from there."
                    );
                  await attachDocumentsToEvent(target, [documentId]);
                  await queryClient.invalidateQueries({
                    queryKey: ["event-documents", documentTargetItem.id]
                  });
                  await queryClient.invalidateQueries({
                    queryKey: ["trip-event-documents", trip.id]
                  });
                }
              : undefined
          }
          onCreateEvent={
            editable && !documentTargetItem
              ? async (document) => {
                  setDocumentToAttach(document);
                  openAddEvent();
                }
              : undefined
          }
          onClose={closeForm}
        />
      )}
      {trip && openForm === "traveler" && editable && (
        <AddTravelerForm trip={trip} onClose={closeForm} />
      )}
      {trip && openForm === "share" && isOwner && (
        <ShareTripForm trip={trip} travelers={travelers} onClose={closeForm} />
      )}
      {trip && openForm === "requirement" && editable && (
        <AddRequirementForm
          trip={trip}
          travelers={travelers}
          preferredTravelerId={focusedTravelerId ?? undefined}
          onClose={closeForm}
        />
      )}
      {trip && viewingRequirement && (
        <RequirementDetailsSheet
          requirement={viewingRequirement}
          itinerary={visibleItinerary}
          timezone={trip.primary_timezone}
          audience={requirementAudienceLabel(
            viewingRequirement.id,
            requirementAssigneesQuery.data ?? [],
            travelers
          )}
          editable={editable}
          onClose={() => setViewingRequirement(null)}
          onEdit={() => {
            setViewingRequirement(null);
            setEditingRequirement(viewingRequirement);
          }}
        />
      )}
      {trip && editingRequirement && editable && (
        <AddRequirementForm
          trip={trip}
          requirement={editingRequirement}
          travelers={travelers}
          onClose={() => setEditingRequirement(null)}
        />
      )}
      {trip && openForm === "note" && editable && <AddNoteForm trip={trip} onClose={closeForm} />}
      {trip && openForm === "settings" && isOwner && (
        <TripSettingsForm trip={trip} onClose={closeForm} onArchived={() => navigate("/trips")} />
      )}
      {trip && eventBookingTarget && editable && (
        <AddActivityBookingForm
          trip={trip}
          item={eventBookingTarget}
          itinerary={visibleItinerary}
          travelers={travelers}
          eventTravelerIds={participantRows
            .filter((row) => row.itinerary_item_id === eventBookingTarget.id)
            .map((row) => row.traveler_id)}
          onClose={() => setEventBookingTarget(null)}
        />
      )}
      {trip && editingBooking && editable && (
        <EditBookingForm
          trip={trip}
          booking={editingBooking}
          travelers={travelers}
          selectedTravelerIds={(bookingTravelersQuery.data ?? [])
            .filter((row) => row.booking_id === editingBooking.id)
            .map((row) => row.traveler_id)}
          onClose={() => setEditingBooking(null)}
        />
      )}
      {trip && editingItinerary && editable && (
        <AddItineraryForm
          trip={trip}
          item={editingItinerary}
          travelers={travelers}
          bookings={bookings}
          onAddBooking={
            canAddEventBooking(editingItinerary)
              ? () => {
                  setEditingItinerary(null);
                  setEventBookingTarget(editingItinerary);
                }
              : undefined
          }
          onClose={() => setEditingItinerary(null)}
        />
      )}
      {trip && editingCost && editable && (
        <AddCostForm
          trip={trip}
          travelers={travelers}
          cost={editingCost}
          onClose={() => setEditingCost(null)}
        />
      )}
      {trip && editingTraveler && editable && (
        <EditTravelerForm
          trip={trip}
          traveler={editingTraveler}
          onClose={() => {
            setEditingTraveler(null);
            setOpenForm("people");
          }}
        />
      )}
    </AppShell>
  );
}
