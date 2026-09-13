import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown, ArrowLeft, ArrowUp, BedDouble, Bus, CalendarClock, CalendarPlus,
  CarTaxiFront, Check, ChevronRight, CookingPot, Download, Ship, FileText, LocateFixed,
  Info, MapPin, NotebookPen, Pencil, Plane, Plus, ReceiptIndianRupee, Search,
  Settings, ShieldCheck, TicketCheck, TrainFront, Trash2, UserPlus, UsersRound, X,
  ExternalLink, Phone, RotateCcw
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { FocusSurface } from "../components/FocusSurface";
import { ModalSheet } from "../components/ModalSheet";
import { CompactCostTotal, CostTotals, ErrorCard, LoadingCard } from "../components/TripUi";
import { OfflinePackControl } from "../features/readiness/OfflinePackControl";
import { AddEventForm } from "../features/timeline/AddEventForm";
import { costsForEvent, eventEndDetails, eventEndTimeZone, eventTimeLabel, journeyDuration, journeyRoute, mapsUrl, phoneActionUrls, readinessSummary, resolveCurrentTimelineItem, searchTrip, sortTimelineItems, timelinePhase, type TimelinePhase } from "../features/timeline/model";
import { preferredScrollBehavior, scrollTimelineEventIntoView } from "../features/timeline/scroll";
import { archiveItineraryItem, archiveTripCost, getTrip, listArchivedTripItems, listCosts, listItinerary, reorderItineraryItems, restoreItineraryItem, restoreTripCost, setItineraryItemStatus } from "../features/trips/api";
import { downloadTripCalendar } from "../features/trips/calendar";
import { formatDateRange, formatEventTime, formatItineraryDate, formatMoney, itineraryDateKey } from "../features/trips/presentation";
import { AddCostForm, AddItineraryForm, TripSettingsForm } from "../features/trips/TripForms";
import { isJourneyEventType, type EventStatus, type ItineraryItem, type TimelineEventType, type Trip, type TripCost } from "../features/trips/types";
import { calculateTripBalances } from "../features/trips/expenses";
import { localProfileId } from "../features/sync/localSync";
import { EventDocuments } from "../features/workspace/EventDocuments";
import { AddActivityBookingForm, canAddActivityBooking } from "../features/workspace/AddActivityBookingForm";
import { filterTravelerWorkspace, readTravelerFocus, writeTravelerFocus } from "../features/workspace/travelerFocus";
import { resolveBoardingInstant } from "../features/workspace/flight";
import { TripAirlinesPanel } from "../features/workspace/TripAirlinesPanel";
import {
  archiveNote, attachDocumentsToEvent, listBookings, listFlightLegsForTrip, listFlightTravelers, listJourneyLegsForTrip, listMembers,
  listNotes, listRequirements, listTravelers, listVaultDocuments, removeMember,
  removeTraveler, updateMemberRole, listTripItineraryParticipants, listTripBookingTravelers,
  listTripRequirementAssignees
} from "../features/workspace/api";
import {
  AddNoteForm, AddRequirementForm, AddTravelerForm, EditTravelerForm,
  ShareTripForm, UploadDocumentForm
} from "../features/workspace/WorkspaceForms";
import type { Booking, FlightLeg, JourneyLeg, MemberRole, Traveler, TripMember, TripNote, VaultDocument } from "../features/workspace/types";

type OpenForm = "event" | "cost" | "document" | "people" | "traveler" | "share" | "requirement" | "note" | "settings" | null;

function openFormFromQuery(value: string | null): OpenForm {
  if (value === "event" || value === "itinerary" || value === "booking") return "event";
  if (["cost", "document", "people", "traveler", "share", "requirement", "note", "settings"].includes(value ?? "")) return value as Exclude<OpenForm, "event" | null>;
  return null;
}

const iconFor: Record<TimelineEventType, typeof Plane> = {
  flight: Plane, train: TrainFront, bus: Bus, ferry: Ship, cab: CarTaxiFront,
  hotel_check_in: BedDouble, hotel_check_out: BedDouble, transport: CarTaxiFront,
  meal: CookingPot, activity: MapPin, preparation: ShieldCheck, custom: CalendarClock
};

function saveScroll(tripId: string, view: "timeline" | "details") {
  try { sessionStorage.setItem(`trip-vault:scroll:${tripId}:${view}`, String(window.scrollY)); } catch { /* Scroll memory is optional. */ }
}

function readScroll(tripId: string, view: "timeline" | "details") {
  try { const value = sessionStorage.getItem(`trip-vault:scroll:${tripId}:${view}`); return value === null ? null : Number(value); } catch { return null; }
}

function EventCost({ item, costs, editable, onAdd, onEdit }: { item: ItineraryItem; costs: TripCost[]; editable: boolean; onAdd: () => void; onEdit: (cost: TripCost) => void }) {
  const linked = costsForEvent(item, costs);
  if (!linked.length) return editable ? <button type="button" onClick={onAdd} className="mt-4 rounded-full bg-warning/10 px-3 py-1.5 text-xs font-extrabold text-warning">Cost missing · add to this event</button> : <span className="mt-4 inline-flex rounded-full bg-warning/10 px-3 py-1.5 text-xs font-bold text-warning">Cost missing</span>;
  const byCurrency = new Map<string, number>();
  for (const cost of linked) byCurrency.set(cost.currency_code, (byCurrency.get(cost.currency_code) ?? 0) + cost.amount_minor);
  const summary = [...byCurrency].map(([currency, amount]) => amount === 0 ? "Free" : formatMoney(amount, currency)).join(" + ");
  return <div className="mt-4 rounded-xl border border-success/20 bg-success/5 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[.1em] text-success">Cost · {summary}</p>{editable && <button type="button" onClick={onAdd} className="text-xs font-extrabold text-brand">+ Add</button>}</div><div className="mt-2 space-y-1.5">{linked.map((cost) => <button key={cost.id} type="button" disabled={!editable} onClick={() => onEdit(cost)} className="flex w-full items-center gap-3 rounded-lg bg-surface/70 px-3 py-2 text-left text-xs disabled:cursor-default"><span className="min-w-0 flex-1 truncate font-bold">{cost.title}</span><span className="capitalize text-muted">{cost.payment_status}</span><strong>{cost.amount_minor === 0 ? "Free" : formatMoney(cost.amount_minor, cost.currency_code)}</strong>{editable && <Pencil className="size-3 text-muted" />}</button>)}</div></div>;
}

function FlightTravelerSummary({ flightLegId, travelers, focusedTravelerId }: { flightLegId: string; travelers: Traveler[]; focusedTravelerId?: string | null }) {
  const query = useQuery({ queryKey: ["flight-travelers", flightLegId], queryFn: () => listFlightTravelers(flightLegId) });
  const rows = (query.data ?? [])
    .filter((row) => !focusedTravelerId || row.traveler_id === focusedTravelerId)
    .filter((row) => row.seat || row.boarding_group || row.ticket_number);
  if (!rows.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Traveler flight details">{rows.map((row) => {
    const travelerName = travelers.find((traveler) => traveler.id === row.traveler_id)?.display_name ?? "Traveler";
    const details = [row.seat ? `Seat ${row.seat}` : null, row.boarding_group ? `Group ${row.boarding_group}` : null, row.ticket_number ? `Ticket ${row.ticket_number}` : null].filter(Boolean).join(" · ");
    return <span key={row.id} className="rounded-lg bg-brand-soft px-2 py-1 font-bold text-brand">{travelerName} · {details}</span>;
  })}</div>;
}

function BookingEventDetails({ tripId, booking, flights, journeys, travelers, focusedTravelerId }: { tripId: string; booking: Booking; flights: FlightLeg[]; journeys: JourneyLeg[]; travelers: Traveler[]; focusedTravelerId?: string | null }) {
  const flightLegs = flights.filter((leg) => leg.booking_id === booking.id).sort((a, b) => a.segment_order - b.segment_order);
  const travelLegs = journeys.filter((leg) => leg.booking_id === booking.id).sort((a, b) => a.segment_order - b.segment_order);
  const route = flightLegs.length ? journeyRoute(flightLegs.map((leg) => ({ origin: leg.departure_airport_code || leg.departure_airport_name, destination: leg.arrival_airport_code || leg.arrival_airport_name }))) : journeyRoute(travelLegs.map((leg) => ({ origin: leg.origin_code || leg.origin_name, destination: leg.destination_code || leg.destination_name })));
  const phone = booking.contact_phone ? phoneActionUrls(booking.contact_phone) : null;
  const firstFlight = flightLegs[0];
  const detailsHref = firstFlight ? `/trips/${tripId}/flights/${firstFlight.id}` : `/trips/${tripId}/bookings/${booking.id}`;

  const heading = <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[.65rem] font-black uppercase tracking-[.12em] text-muted">{booking.type} booking{booking.journey_scope ? ` · ${booking.journey_scope}` : ""}</p><p className="mt-1 font-bold">{booking.provider || booking.title}</p>{route && <p className="mt-1 font-black text-brand">{route}</p>}{booking.reference_code && <p className="mt-1 text-xs text-muted"><strong className="text-ink">{booking.type === "flight" ? "PNR" : "Reference"}:</strong> {booking.reference_code}</p>}</div><Link to={detailsHref} className="secondary-button min-h-9 px-3 py-2 text-xs">Full details <ExternalLink className="size-3.5" /></Link></div>;

  if (flightLegs.length) {
    return <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-3 sm:p-4">{heading}<div className="mt-3 space-y-2">{flightLegs.map((leg, index) => <Link to={`/trips/${tripId}/flights/${leg.id}`} key={leg.id} className="block rounded-xl bg-elevated p-3 text-xs"><div className="flex items-start justify-between gap-2"><strong>{leg.departure_airport_code || leg.departure_airport_name} → {leg.arrival_airport_code || leg.arrival_airport_name}</strong><span className={`rounded-full px-2 py-1 text-[.6rem] font-black uppercase ${leg.status === "cancelled" ? "bg-danger/10 text-danger" : leg.status === "delayed" ? "bg-warning/10 text-warning" : "bg-brand-soft text-brand"}`}>{flightLegs.length > 1 ? `Leg ${index + 1} · ` : ""}{leg.status.replaceAll("_", " ")}</span></div><p className="mt-1 text-muted">{leg.airline_name} {leg.flight_number} · {journeyDuration(leg.scheduled_departure_at, leg.scheduled_arrival_at)}</p><p className="mt-1 text-muted">Depart {formatEventTime(leg.scheduled_departure_at, leg.departure_timezone)}</p><p className="text-muted">Arrive {formatEventTime(leg.scheduled_arrival_at, leg.arrival_timezone)}</p>{(resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes) || leg.departure_terminal || leg.departure_gate || leg.arrival_terminal || leg.baggage_claim) && <p className="mt-2 font-bold text-ink">{resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes) ? `Board ${formatEventTime(resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes)!, leg.departure_timezone)} · ` : ""}T{leg.departure_terminal || "—"} · Gate {leg.departure_gate || "—"}{leg.arrival_terminal ? ` · Arrive T${leg.arrival_terminal}` : ""}{leg.baggage_claim ? ` · Bag ${leg.baggage_claim}` : ""}</p>}<FlightTravelerSummary flightLegId={leg.id} travelers={travelers} focusedTravelerId={focusedTravelerId} /></Link>)}</div><BookingContact booking={booking} phone={phone} /></div>;
  }
  if (travelLegs.length) {
    return <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-3 sm:p-4">{heading}<div className="mt-3 space-y-2">{travelLegs.map((leg, index) => <Link to={detailsHref} key={leg.id} className="block rounded-xl bg-elevated p-3 text-xs"><div className="flex items-start justify-between gap-2"><strong>{leg.origin_code || leg.origin_name} → {leg.destination_code || leg.destination_name}</strong>{travelLegs.length > 1 && <span className="rounded-full bg-brand-soft px-2 py-1 text-[.6rem] font-black uppercase text-brand">Leg {index + 1}</span>}</div><p className="mt-1 text-muted">{leg.operator_name}{leg.service_number ? ` ${leg.service_number}` : ""} · {journeyDuration(leg.scheduled_departure_at, leg.scheduled_arrival_at)}</p><p className="mt-1 text-muted">Depart {formatEventTime(leg.scheduled_departure_at, leg.origin_timezone)}</p><p className="text-muted">Arrive {formatEventTime(leg.scheduled_arrival_at, leg.destination_timezone)}</p>{(resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes) || leg.departure_platform || leg.arrival_platform || leg.coach_or_cabin || leg.seat) && <p className="mt-2 font-bold text-ink">{resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes) ? `Board ${formatEventTime(resolveBoardingInstant(leg.scheduled_departure_at, leg.boarding_at, leg.boarding_lead_minutes)!, leg.origin_timezone)} · ` : ""}Platform {leg.departure_platform || "—"}{leg.arrival_platform ? ` → ${leg.arrival_platform}` : ""}{leg.coach_or_cabin ? ` · ${leg.coach_or_cabin}` : ""}{leg.seat ? ` · Seat ${leg.seat}` : ""}</p>}</Link>)}</div><BookingContact booking={booking} phone={phone} /></div>;
  }
  return <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-3 sm:p-4">{heading}{(booking.start_at || booking.end_at || booking.location?.label) && <div className="mt-3 rounded-xl bg-elevated p-3 text-xs text-muted">{booking.start_at && <p>Starts {formatEventTime(booking.start_at, booking.source_timezone || "UTC")}</p>}{booking.end_at && <p>Ends {formatEventTime(booking.end_at, booking.source_timezone || "UTC")}</p>}{booking.location?.label && <p className="mt-1">{booking.location.label}</p>}</div>}<BookingContact booking={booking} phone={phone} /></div>;
}

function BookingContact({ booking, phone }: { booking: Booking; phone: ReturnType<typeof phoneActionUrls> }) {
  if (!booking.booked_via_name && !booking.booked_via_url && !booking.contact_phone) return null;
  return <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs"><span className="text-muted">{booking.booked_via_name ? `Booked via ${booking.booked_via_name}` : "Booking contact"}</span>{booking.booked_via_url && <a className="font-extrabold text-brand" href={booking.booked_via_url} target="_blank" rel="noreferrer">Open website</a>}{phone && <><a className="inline-flex items-center gap-1 font-extrabold text-brand" href={phone.call}><Phone className="size-3" /> Call{booking.contact_name ? ` ${booking.contact_name}` : ""}</a><a className="font-extrabold text-success" href={phone.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a></>}</div>;
}

function EventTravelers({ item, travelerIds, travelers }: { item: ItineraryItem; travelerIds: string[]; travelers: Traveler[] }) {
  const names = travelerIds.map((id) => travelers.find((traveler) => traveler.id === id)?.display_name).filter((name): name is string => Boolean(name));
  return <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted"><UsersRound className="size-4" /><span className="font-bold text-ink">For:</span>{item.applies_to_all_travelers ? <span>Everyone</span> : names.length ? names.map((name) => <span key={name} className="rounded-full bg-brand-soft px-2 py-1 font-bold text-brand">{name}</span>) : <span>Selected travelers</span>}</div>;
}

function BookingEventSummary({ booking, flights, journeys }: { booking: Booking; flights: FlightLeg[]; journeys: JourneyLeg[] }) {
  const flightLegs = flights.filter((leg) => leg.booking_id === booking.id).sort((a, b) => a.segment_order - b.segment_order);
  const travelLegs = journeys.filter((leg) => leg.booking_id === booking.id).sort((a, b) => a.segment_order - b.segment_order);
  const legs = flightLegs.length ? flightLegs : travelLegs;
  const route = journeyRoute(legs.map((leg) => "departure_airport_code" in leg
    ? { origin: leg.departure_airport_code || leg.departure_airport_name, destination: leg.arrival_airport_code || leg.arrival_airport_name }
    : { origin: leg.origin_code || leg.origin_name, destination: leg.destination_code || leg.destination_name }));
  const seat = travelLegs.map((leg) => leg.seat).filter(Boolean).join(", ");
  return <div className="mt-3 rounded-xl border border-line/80 bg-surface/60 px-3 py-2.5 text-xs"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><strong>{booking.provider || booking.title}</strong>{booking.reference_code && <span className="text-muted">{booking.type === "flight" ? "PNR" : "Ref"} {booking.reference_code}</span>}</div>{route && <p className="mt-1 font-bold text-brand">{route}{legs.length > 1 ? ` · ${legs.length - 1} connection${legs.length > 2 ? "s" : ""}` : ""}</p>}{seat && <p className="mt-1 font-bold text-ink">Seat {seat}</p>}</div>;
}

export function EventDetailsSheet({ item, tripId, booking, flights, journeys, travelerIds, travelers, costs, focusedTravelerId, editable, canMoveUp, canMoveDown, onClose, onEdit, onArchive, onAddBooking, onAddCost, onEditCost, onUploadDocument, onStatus, onMoveUp, onMoveDown }: { item: ItineraryItem; tripId: string; booking?: Booking; flights: FlightLeg[]; journeys: JourneyLeg[]; travelerIds: string[]; travelers: Traveler[]; costs: TripCost[]; focusedTravelerId?: string | null; editable: boolean; canMoveUp: boolean; canMoveDown: boolean; onClose: () => void; onEdit: () => void; onArchive: () => void; onAddBooking: () => void; onAddCost: () => void; onEditCost: (cost: TripCost) => void; onUploadDocument: () => void; onStatus: (status: EventStatus) => void; onMoveUp: () => void; onMoveDown: () => void }) {
  const Icon = iconFor[item.event_type ?? "custom"];
  const map = mapsUrl(item.location); const end = eventEndDetails(item); const endTimeZone = eventEndTimeZone(item, flights, journeys); const timingLabel = eventTimeLabel(item);
  const showTimeZone = isJourneyEventType(item.event_type) && booking?.journey_scope === "international";
  return <ModalSheet eyebrow={(item.event_type ?? "event").replaceAll("_", " ")} title={item.title} onClose={onClose}>
    <div className="mt-5 flex items-start gap-4 rounded-2xl bg-elevated p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon className="size-5" /></span><div className="min-w-0"><p className="text-sm font-black">{timingLabel ?? formatEventTime(item.starts_at, item.timezone)}</p><p className="mt-1 text-xs text-muted">{item.timing_mode === "unscheduled" ? "Schedule this when your plan is clearer" : showTimeZone ? item.timezone : "Local schedule"}</p>{end && <p className="mt-2 text-xs text-muted">{end.journey ? "Arrives" : "Ends"} {formatEventTime(end.endsAt, endTimeZone)} · {end.duration}</p>}<span className="mt-2 inline-flex rounded-full bg-surface px-2 py-1 text-[.65rem] font-black uppercase text-muted">{(item.event_status ?? "planned").replaceAll("_", " ")}</span></div></div>
    <EventTravelers item={item} travelerIds={travelerIds} travelers={travelers} />
    {item.location?.label && <p className="mt-4 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" />{item.location.label}</p>}
    {map && <a href={map} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-brand"><LocateFixed className="size-4" /> Navigate</a>}
    {item.notes && <p className="mt-4 whitespace-pre-wrap rounded-xl bg-elevated p-3 text-sm leading-6 text-muted">{item.notes}</p>}
    {booking && <BookingEventDetails tripId={tripId} booking={booking} flights={flights} journeys={journeys} travelers={travelers} focusedTravelerId={focusedTravelerId} />}
    {editable && item.event_type === "activity" && !item.booking_id && (canAddActivityBooking(item)
      ? <div className="mt-4 rounded-2xl border border-line bg-surface/70 p-4"><p className="text-sm font-extrabold">Booked this activity?</p><p className="mt-1 text-xs leading-5 text-muted">Add the confirmation and provider now without recreating the timeline event.</p><button type="button" className="secondary-button mt-3" onClick={onAddBooking}><TicketCheck className="size-4" /> Add booking details</button></div>
      : <div className="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4"><p className="text-sm font-extrabold text-warning">Booking details need an exact time</p><p className="mt-1 text-xs leading-5 text-muted">Edit this flexible activity and choose Exact date &amp; time before attaching a reservation.</p><button type="button" className="secondary-button mt-3" onClick={onEdit}><Pencil className="size-4" /> Set exact time</button></div>)}
    {editable && <fieldset className="mt-5 rounded-2xl border border-line p-3"><legend className="px-1 text-xs font-black uppercase tracking-[.12em] text-muted">Event status</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{(["planned", "done", "skipped", "cancelled"] as EventStatus[]).map((status) => <button key={status} type="button" onClick={() => onStatus(status)} className={`rounded-xl px-3 py-2 text-xs font-extrabold capitalize ${(item.event_status ?? "planned") === status ? "bg-brand text-surface" : "bg-elevated text-muted"}`}>{status}</button>)}</div></fieldset>}
    <EventCost item={item} costs={costs} editable={editable} onAdd={onAddCost} onEdit={onEditCost} />
    <EventDocuments item={item} canEdit={editable} onUpload={onUploadDocument} travelerId={focusedTravelerId} />
    {editable && (canMoveUp || canMoveDown) && <div className="mt-5 flex gap-2"><span className="self-center text-xs font-bold text-muted">Same-time order:</span><button type="button" disabled={!canMoveUp} onClick={onMoveUp} className="secondary-button min-h-9 px-3 py-2 text-xs disabled:opacity-30"><ArrowUp className="size-3.5" /> Earlier</button><button type="button" disabled={!canMoveDown} onClick={onMoveDown} className="secondary-button min-h-9 px-3 py-2 text-xs disabled:opacity-30"><ArrowDown className="size-3.5" /> Later</button></div>}
    {editable && <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5"><button type="button" className="secondary-button" onClick={onEdit}><Pencil className="size-4" /> Edit event</button><button type="button" className="secondary-button text-danger" onClick={onArchive}><Trash2 className="size-4" /> Archive</button></div>}
  </ModalSheet>;
}

const phaseLabels: Record<TimelinePhase, string> = { past: "Past", current: "Happening now", future: "Upcoming", unscheduled: "Unscheduled" };

function phaseForActive(item: ItineraryItem, active: boolean) {
  const phase = timelinePhase(item);
  if (!active) return phaseLabels[phase];
  if (phase === "current") return "Happening now";
  if (phase === "future") return "Next event";
  if (phase === "unscheduled") return "Needs scheduling";
  return "Most recent event";
}

function Section({ id, title, eyebrow, action, children }: { id: string; title: string; eyebrow: string; action?: ReactNode; children: ReactNode }) {
  return <section id={id} className="surface-card scroll-mt-28 p-5 sm:p-6"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-black">{title}</h2></div>{action}</div><div className="mt-5">{children}</div></section>;
}

function PeopleSheet({ trip, travelers, members, selectedId, editable, isOwner, onSelect, onAdd, onShare, onClose, onRefresh }: { trip: Trip; travelers: Traveler[]; members: TripMember[]; selectedId: string | null; editable: boolean; isOwner: boolean; onSelect: (id: string | null) => void; onAdd: () => void; onShare: () => void; onClose: () => void; onRefresh: () => void }) {
  return <ModalSheet eyebrow={trip.title} title="People & sharing" onClose={onClose}>
    <p className="mt-3 text-sm leading-6 text-muted">Choose whose plan and documents you are working with. Switching never asks for extra permission; access still requires signing in.</p>
    <div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => onSelect(null)} className={`rounded-2xl border p-4 text-left ${selectedId === null ? "border-brand bg-brand-soft" : "border-line"}`}><UsersRound className="size-5 text-brand" /><strong className="mt-3 block">Everyone</strong></button>{travelers.map((traveler) => <button type="button" key={traveler.id} onClick={() => onSelect(traveler.id)} className={`rounded-2xl border p-4 text-left ${selectedId === traveler.id ? "border-brand bg-brand-soft" : "border-line"}`}><span className="grid size-7 place-items-center rounded-full bg-brand text-[.65rem] font-black text-surface">{traveler.display_name.slice(0, 2).toUpperCase()}</span><strong className="mt-3 block truncate">{traveler.display_name}</strong><span className="text-xs text-muted">{traveler.is_minor ? "Managed child" : "Traveler"}</span></button>)}</div>
    {editable && <button type="button" onClick={onAdd} className="secondary-button mt-4 w-full"><UserPlus className="size-4" /> Add traveler</button>}
    <div className="mt-6 border-t border-line pt-5"><p className="eyebrow">Signed-in members</p><div className="mt-3 space-y-3">{members.map((member) => <div className="flex items-center gap-2 rounded-xl bg-elevated p-3 text-sm" key={member.user_id}><span className="min-w-0 flex-1 truncate font-bold">{member.display_name}{member.participation_type === "collaborator" ? " · helper" : ""}</span>{isOwner && member.role !== "owner" ? <><select aria-label={`Role for ${member.display_name}`} className="rounded-lg border border-line bg-surface p-2 capitalize" defaultValue={member.role} onChange={async (event) => { await updateMemberRole(trip.id, member.user_id, event.target.value as "editor" | "viewer"); onRefresh(); }}><option value="editor">editor</option><option value="viewer">viewer</option></select><button type="button" className="text-xs font-bold text-danger" onClick={async () => { if (!window.confirm(`Remove ${member.display_name}? Downloaded copies cannot be erased remotely.`)) return; await removeMember(trip.id, member.user_id); onRefresh(); }}>Remove</button></> : <span className="text-xs capitalize text-muted">{member.role}</span>}</div>)}</div>{isOwner && <button type="button" className="primary-button mt-4 w-full" onClick={onShare}><UsersRound className="size-4" /> Share trip</button>}</div>
  </ModalSheet>;
}

export function TripPage() {
  const { tripId = "" } = useParams(); const navigate = useNavigate(); const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams(); const view: "timeline" | "details" = searchParams.get("view") === "details" ? "details" : "timeline";
  const requestedForm = openFormFromQuery(searchParams.get("add")); const requestedSection = searchParams.get("section");
  const [openForm, setOpenForm] = useState<OpenForm>(requestedForm);
  const [userId, setUserId] = useState(""); const [query, setQuery] = useState("");
  const [editingItinerary, setEditingItinerary] = useState<ItineraryItem | null>(null); const [editingCost, setEditingCost] = useState<TripCost | null>(null); const [editingTraveler, setEditingTraveler] = useState<Traveler | null>(null); const [editingNote, setEditingNote] = useState<TripNote | null>(null);
  const [viewingItineraryId, setViewingItineraryId] = useState<string | null>(null);
  const [costTargetItem, setCostTargetItem] = useState<ItineraryItem | null>(null);
  const [documentTargetItem, setDocumentTargetItem] = useState<ItineraryItem | null>(null);
  const [activityBookingTarget, setActivityBookingTarget] = useState<ItineraryItem | null>(null);
  const [focusedTravelerId, setFocusedTravelerId] = useState<string | null>(() => readTravelerFocus(tripId));
  const positioned = useRef(false); const restoreTimelineScroll = useRef(false); const requestedTimelineItem = useRef<string | null>(null);
  useEffect(() => { void localProfileId().then((id) => setUserId(id ?? "")); }, []);
  useEffect(() => { setFocusedTravelerId(readTravelerFocus(tripId)); positioned.current = false; }, [tripId]);
  useEffect(() => { if (requestedForm) setOpenForm(requestedForm); }, [requestedForm]);

  const tripQuery = useQuery({ queryKey: ["trip", tripId], queryFn: () => getTrip(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ queryKey: ["itinerary", tripId], queryFn: () => listItinerary(tripId), enabled: Boolean(tripId) });
  const costsQuery = useQuery({ queryKey: ["costs", tripId], queryFn: () => listCosts(tripId), enabled: Boolean(tripId) });
  const bookingsQuery = useQuery({ queryKey: ["bookings", tripId], queryFn: () => listBookings(tripId), enabled: Boolean(tripId) });
  const flightsQuery = useQuery({ queryKey: ["flights", tripId], queryFn: () => listFlightLegsForTrip(tripId), enabled: Boolean(tripId) });
  const journeysQuery = useQuery({ queryKey: ["journey-legs", tripId], queryFn: () => listJourneyLegsForTrip(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ queryKey: ["travelers", tripId], queryFn: () => listTravelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ queryKey: ["members", tripId], queryFn: () => listMembers(tripId), enabled: Boolean(tripId) });
  const documentsQuery = useQuery({ queryKey: ["documents", tripId], queryFn: () => listVaultDocuments(tripId), enabled: Boolean(tripId) });
  const requirementsQuery = useQuery({ queryKey: ["requirements", tripId], queryFn: () => listRequirements(tripId), enabled: Boolean(tripId) });
  const notesQuery = useQuery({ queryKey: ["notes", tripId], queryFn: () => listNotes(tripId), enabled: Boolean(tripId) });
  const archivedItemsQuery = useQuery({ queryKey: ["archived-trip-items", tripId], queryFn: () => listArchivedTripItems(tripId), enabled: Boolean(tripId) && navigator.onLine });
  const itineraryIds = (itineraryQuery.data ?? []).map((item) => item.id);
  const bookingIds = (bookingsQuery.data ?? []).map((item) => item.id);
  const requirementIds = (requirementsQuery.data ?? []).map((item) => item.id);
  const participantsQuery = useQuery({ queryKey: ["itinerary-participants", tripId, itineraryIds], queryFn: () => listTripItineraryParticipants(tripId, itineraryIds), enabled: Boolean(tripId) && itineraryQuery.isSuccess });
  const bookingTravelersQuery = useQuery({ queryKey: ["booking-travelers", tripId, bookingIds], queryFn: () => listTripBookingTravelers(tripId, bookingIds), enabled: Boolean(tripId) && bookingsQuery.isSuccess });
  const requirementAssigneesQuery = useQuery({ queryKey: ["requirement-assignees", tripId, requirementIds], queryFn: () => listTripRequirementAssignees(tripId, requirementIds), enabled: Boolean(tripId) && requirementsQuery.isSuccess });
  const trip = tripQuery.data; const travelers = travelersQuery.data ?? []; const members = membersQuery.data ?? [];
  const role = members.find((member) => member.user_id === userId)?.role as MemberRole | undefined; const editable = role === "owner" || role === "editor"; const isOwner = role === "owner";
  const itinerary = itineraryQuery.data ?? []; const costs = costsQuery.data ?? []; const bookings = bookingsQuery.data ?? []; const flights = flightsQuery.data ?? []; const journeys = journeysQuery.data ?? []; const documents = documentsQuery.data ?? []; const requirements = requirementsQuery.data ?? [];
  const participantRows = participantsQuery.data ?? [];
  const focusedWorkspace = useMemo(() => filterTravelerWorkspace({ travelerId: focusedTravelerId, itinerary, participants: participantRows, bookings, bookingTravelers: bookingTravelersQuery.data ?? [], costs, requirements, requirementAssignees: requirementAssigneesQuery.data ?? [], documents }), [focusedTravelerId, itinerary, participantRows, bookings, bookingTravelersQuery.data, costs, requirements, requirementAssigneesQuery.data, documents]);
  const visibleItinerary = useMemo(() => sortTimelineItems(focusedWorkspace.itinerary), [focusedWorkspace.itinerary]); const visibleBookings = focusedWorkspace.bookings; const visibleCosts = focusedWorkspace.costs; const visibleRequirements = focusedWorkspace.requirements; const focusedDocuments = focusedWorkspace.documents;
  const viewingItinerary = viewingItineraryId ? visibleItinerary.find((item) => item.id === viewingItineraryId) : undefined;
  const viewingItineraryIndex = viewingItinerary ? itinerary.findIndex((item) => item.id === viewingItinerary.id) : -1;
  const activeItem = useMemo(() => resolveCurrentTimelineItem(visibleItinerary), [visibleItinerary]); const readiness = useMemo(() => readinessSummary(visibleRequirements), [visibleRequirements]);
  const balances = useMemo(() => calculateTripBalances(visibleCosts).filter((balance) => !focusedTravelerId || balance.travelerId === focusedTravelerId), [visibleCosts, focusedTravelerId]);
  const flightByBooking = useMemo(() => new Map(flights.slice().sort((a, b) => a.segment_order - b.segment_order).map((flight) => [flight.booking_id, flight])), [flights]);
  const focusedTraveler = focusedTravelerId ? travelers.find((traveler) => traveler.id === focusedTravelerId) : undefined;
  const results = useMemo(() => searchTrip({ query, tripId, itinerary: visibleItinerary, bookings: visibleBookings, flights, journeys, documents: focusedDocuments, travelers: focusedTraveler ? [focusedTraveler] : travelers, requirements: visibleRequirements }), [query, tripId, visibleItinerary, visibleBookings, flights, journeys, focusedDocuments, focusedTraveler, travelers, visibleRequirements]);
  const phaseJumps = useMemo(() => {
    const firstByPhase = new Map<TimelinePhase, ItineraryItem>();
    for (const item of visibleItinerary) { const phase = timelinePhase(item); if (!firstByPhase.has(phase)) firstByPhase.set(phase, item); }
    return (["past", "current", "future", "unscheduled"] as const).flatMap((phase) => firstByPhase.has(phase) ? [{ phase, item: firstByPhase.get(phase)! }] : []);
  }, [visibleItinerary]);

  useEffect(() => {
    if (view !== "timeline" || positioned.current || !itineraryQuery.isSuccess || participantsQuery.isLoading || bookingTravelersQuery.isLoading || requirementAssigneesQuery.isLoading) return;
    const firstFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const requestedId = requestedTimelineItem.current;
        if (requestedId && scrollTimelineEventIntoView(requestedId, preferredScrollBehavior())) {
          requestedTimelineItem.current = null; restoreTimelineScroll.current = false; positioned.current = true; return;
        }
        const saved = restoreTimelineScroll.current ? readScroll(tripId, "timeline") : null;
        if (saved !== null) window.scrollTo({ top: saved, behavior: "auto" });
        else if (activeItem) scrollTimelineEventIntoView(activeItem.id, preferredScrollBehavior());
        restoreTimelineScroll.current = false; positioned.current = true;
      });
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [activeItem, itineraryQuery.isSuccess, participantsQuery.isLoading, bookingTravelersQuery.isLoading, requirementAssigneesQuery.isLoading, tripId, view]);
  useEffect(() => {
    if (view !== "details" || !requestedSection || !tripQuery.isSuccess) return;
    const frame = window.requestAnimationFrame(() => document.getElementById(requestedSection)?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [requestedSection, tripQuery.isSuccess, view]);
  useEffect(() => { if (focusedTravelerId && travelersQuery.data && !travelers.some((traveler) => traveler.id === focusedTravelerId)) setFocusedTravelerId(null); }, [focusedTravelerId, travelersQuery.data, travelers]);

  const chooseTraveler = (id: string | null) => { setFocusedTravelerId(id); writeTravelerFocus(tripId, id); positioned.current = false; setViewingItineraryId(null); };
  const changeView = (next: "timeline" | "details") => { if (next === view) return; saveScroll(tripId, view); if (next === "timeline") { restoreTimelineScroll.current = !requestedTimelineItem.current; positioned.current = false; } const nextParams = new URLSearchParams(searchParams); if (next === "details") nextParams.set("view", "details"); else { nextParams.delete("view"); nextParams.delete("section"); } setSearchParams(nextParams); if (next === "details") window.setTimeout(() => window.scrollTo({ top: readScroll(tripId, next) ?? 0, behavior: "auto" }), 0); };
  const closeForm = () => { setOpenForm(null); setCostTargetItem(null); setDocumentTargetItem(null); const next = new URLSearchParams(searchParams); next.delete("add"); setSearchParams(next, { replace: true }); };
  const scrollToItem = (id: string) => { setQuery(""); requestedTimelineItem.current = id; positioned.current = false; if (view === "timeline") { window.requestAnimationFrame(() => { if (scrollTimelineEventIntoView(id, preferredScrollBehavior())) { requestedTimelineItem.current = null; positioned.current = true; } }); } else changeView("timeline"); };
  const openExpenses = () => { if (view !== "details") saveScroll(tripId, view); const nextParams = new URLSearchParams(searchParams); nextParams.set("view", "details"); nextParams.set("section", "costs"); nextParams.delete("add"); setSearchParams(nextParams); window.requestAnimationFrame(() => document.getElementById("costs")?.scrollIntoView({ behavior: preferredScrollBehavior(), block: "start" })); };

  const archiveItinerary = useMutation({ mutationFn: archiveItineraryItem, onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] }), queryClient.invalidateQueries({ queryKey: ["bookings", tripId] }), queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] })]); } });
  const reorderItinerary = useMutation({ mutationFn: ({ itemId, direction }: { itemId: string; direction: "up" | "down" }) => reorderItineraryItems(itinerary, itemId, direction), onSuccess: (items) => queryClient.setQueryData(["itinerary", tripId], items) });
  const updateEventStatus = useMutation({ mutationFn: ({ item, status }: { item: ItineraryItem; status: EventStatus }) => setItineraryItemStatus(item, status), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] }) });
  const archiveCost = useMutation({ mutationFn: archiveTripCost, onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["costs", tripId] }), queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] })]); } });
  const restoreArchivedItem = useMutation({ mutationFn: async ({ id, kind }: { id: string; kind: "event" | "booking" | "cost" }) => kind === "cost" ? restoreTripCost(id) : restoreItineraryItem(id), onSuccess: async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] }), queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] }), queryClient.invalidateQueries({ queryKey: ["bookings", tripId] }), queryClient.invalidateQueries({ queryKey: ["costs", tripId] })]); } });
  const removeTravelerMutation = useMutation({ mutationFn: removeTraveler, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["travelers", tripId] }) });
  const archiveNoteMutation = useMutation({ mutationFn: archiveNote, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", tripId] }) });

  return <AppShell><div className="mx-auto max-w-6xl pb-24">
    <Link to="/trips" className="tap-target inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-ink"><ArrowLeft className="size-4" /> All trips</Link>
    {tripQuery.isLoading && <LoadingCard />}{tripQuery.error && <ErrorCard error={tripQuery.error} title="This trip could not be opened" />}
    {trip && <>
      <header className="page-enter mt-4 rounded-[2rem] bg-brand p-5 text-surface shadow-focus sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-surface/60">{formatDateRange(trip.start_date, trip.end_date)}</p><h1 className="mt-2 font-display text-3xl font-black tracking-[-.05em] sm:text-4xl">{trip.title}</h1><p className="mt-2 flex items-center gap-2 text-sm text-surface/70"><MapPin className="size-4" />{trip.destination_summary}</p></div><span className="rounded-full bg-surface/10 px-3 py-2 text-xs font-bold capitalize">{role ?? "member"}</span></div>
        <div className="mt-5 grid grid-cols-2 rounded-2xl bg-surface/10 p-1"><button type="button" onClick={() => changeView("timeline")} className={`tap-target rounded-xl text-sm font-black ${view === "timeline" ? "bg-surface text-brand shadow-soft" : "text-surface/70"}`}>Timeline</button><button type="button" onClick={() => changeView("details")} className={`tap-target rounded-xl text-sm font-black ${view === "details" ? "bg-surface text-brand shadow-soft" : "text-surface/70"}`}>Trip details</button></div>
        <button type="button" onClick={openExpenses} className="mt-4 inline-flex max-w-full items-center gap-2 rounded-xl bg-surface/10 px-3 py-2 text-left transition hover:bg-surface/15"><CompactCostTotal costs={visibleCosts} emptyText="Add your first trip cost" inverse /><ChevronRight className="size-4 shrink-0 text-surface/60" /></button>
      </header>
      <div className="relative mt-4"><Search className="pointer-events-none absolute left-4 top-3.5 size-5 text-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} className="form-input mt-0 pl-12 pr-11" placeholder="Search timeline, PNR, airport, document, traveler…" aria-label="Search this trip" />{query && <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1.5 grid size-9 place-items-center text-muted" aria-label="Clear search"><X className="size-4" /></button>}{query.length >= 2 && <div className="absolute z-40 mt-2 max-h-96 w-full overflow-auto rounded-2xl border border-line bg-surface p-2 shadow-focus">{results.map((result) => result.href ? <Link key={result.id} to={result.href} onClick={() => setQuery("")} className="block rounded-xl px-3 py-3 hover:bg-elevated"><strong className="block text-sm">{result.title}</strong><span className="text-xs text-muted">{result.group} · {result.detail}</span></Link> : <button key={result.id} type="button" onClick={() => { if (result.timelineItemId) scrollToItem(result.timelineItemId); else if (result.group === "Travelers") { chooseTraveler(result.id.replace("traveler:", "")); setQuery(""); } }} className="block w-full rounded-xl px-3 py-3 text-left hover:bg-elevated"><strong className="block text-sm">{result.title}</strong><span className="text-xs text-muted">{result.group} · {result.detail}</span></button>)}{results.length === 0 && <p className="p-4 text-sm text-muted">Nothing in this trip matches.</p>}</div>}</div>

      {view === "timeline" ? <main className="mt-5">
        <section className="surface-card overflow-hidden p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Before you go</p><h2 className="mt-1 font-display text-xl font-black">Trip readiness</h2></div><ShieldCheck className={`size-6 ${readiness.remaining ? "text-warning" : "text-success"}`} /></div>{readiness.total ? <><p className="mt-3 text-sm text-muted">{readiness.resolved} of {readiness.total} checks resolved{readiness.dueDate ? ` · next due ${new Date(`${readiness.dueDate}T12:00:00`).toLocaleDateString()}` : ""}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-elevated"><span className="block h-full rounded-full bg-success transition-all" style={{ width: `${Math.round(readiness.resolved / readiness.total * 100)}%` }} /></div></> : <p className="mt-3 text-sm text-muted">Add visas, passports, insurance, packing, or custom checks. Dated preparation tasks still belong in the timeline below.</p>}<div className="mt-4 flex gap-4"><Link className="text-sm font-extrabold text-brand" to={`/trips/${trip.id}/readiness`}>Open checklist</Link>{editable && <button type="button" className="text-sm font-extrabold text-brand" onClick={() => setOpenForm("requirement")}>+ Add check</button>}</div></section>
        <section className="surface-card mt-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Everything in order</p><h2 className="mt-1 font-display text-2xl font-black">{focusedTraveler ? `${focusedTraveler.display_name}'s timeline` : "Complete timeline"}</h2><p className="mt-2 text-sm text-muted">{focusedTraveler ? "Shared events and this traveler's events are shown in time order." : "Past events are above you. Upcoming events continue below."}</p></div>{visibleItinerary.length > 0 && <button type="button" className="secondary-button" onClick={() => downloadTripCalendar(trip, visibleItinerary)}><Download className="size-4" /> Calendar</button>}</div>
          {phaseJumps.length > 0 && <nav aria-label="Timeline sections" className="sticky top-2 z-30 mt-4 flex gap-2 overflow-auto rounded-2xl border border-line bg-surface/95 p-2 shadow-soft backdrop-blur">{phaseJumps.map(({ phase, item }) => <button key={phase} type="button" onClick={() => scrollToItem(item.id)} className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black ${phase === "current" ? "bg-coral text-white" : "bg-elevated text-brand"}`}>{phaseLabels[phase]}</button>)}</nav>}
          <div className="relative mt-6 before:absolute before:bottom-5 before:left-1 before:top-5 before:w-px before:bg-line sm:before:left-[8.25rem]">
            {visibleItinerary.map((item, index, items) => {
              const current = activeItem?.id === item.id;
              const phase = timelinePhase(item);
              const previousPhase = index ? timelinePhase(items[index - 1]) : null;
              const Icon = iconFor[item.event_type ?? "custom"];
              const booking = item.booking_id ? visibleBookings.find((row) => row.id === item.booking_id) : undefined;
              const end = eventEndDetails(item);
              const endTimeZone = eventEndTimeZone(item, flights, journeys);
              const timingLabel = eventTimeLabel(item);
              const map = mapsUrl(item.location);
              const travelerIds = participantRows.filter((row) => row.itinerary_item_id === item.id).map((row) => row.traveler_id);
              return <Fragment key={item.id}>
                {phase !== previousPhase && <div id={`timeline-phase-${phase}`} className={`${index ? "pt-7" : ""} relative z-10 pb-3 pl-6 sm:pl-[10.5rem]`}><span className={`inline-flex rounded-full px-3 py-1.5 text-[.65rem] font-black uppercase tracking-[.14em] ${phase === "current" ? "bg-coral text-white" : "border border-line bg-surface text-muted"}`}>{phaseLabels[phase]}</span></div>}
                {item.timing_mode !== "unscheduled" && (index === 0 || items[index - 1].timing_mode === "unscheduled" || itineraryDateKey(items[index - 1].starts_at, items[index - 1].timezone) !== itineraryDateKey(item.starts_at, item.timezone)) && <h3 className={`${index ? "pt-3" : ""} pb-3 pl-6 text-sm font-black sm:pl-[10.5rem]`}>{formatItineraryDate(item.starts_at, item.timezone)}</h3>}
                <div id={`timeline-${item.id}`} className="relative mb-4 grid scroll-mt-28 grid-cols-1 pl-5 sm:grid-cols-[6rem_2.5rem_minmax(0,1fr)] sm:gap-4 sm:pl-0">
                  <span aria-hidden="true" className={`absolute left-[-0.05rem] top-6 z-10 size-2.5 rounded-full ring-4 ring-surface sm:hidden ${current ? "bg-coral" : phase === "past" ? "bg-line" : "bg-brand"}`} />
                  <time className={`hidden pt-4 text-right text-xs font-black sm:block ${current ? "text-coral" : "text-muted"}`}>{timingLabel ?? formatEventTime(item.starts_at, item.timezone).split(",").at(-1)}</time>
                  <span className={`z-10 mt-3 hidden size-10 place-items-center rounded-full border-4 border-surface sm:grid ${current ? "bg-coral text-white shadow-focus" : phase === "past" ? "bg-line text-muted" : "bg-brand-soft text-brand"}`}><Icon className="size-4" /></span>
                  <FocusSurface active={current} role="button" tabIndex={0} onClick={() => setViewingItineraryId(item.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setViewingItineraryId(item.id); } }} className={`group cursor-pointer p-4 pr-16 outline-none hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft focus-visible:ring-2 focus-visible:ring-brand sm:p-5 ${current ? "bg-coral/10" : "bg-elevated"}`} aria-label={`Open details for ${item.title}`}>
                    <span className={`absolute right-4 top-4 grid size-10 place-items-center rounded-xl sm:hidden ${current ? "bg-coral text-white" : phase === "past" ? "bg-line/70 text-muted" : "bg-brand-soft text-brand"}`}><Icon className="size-4" /></span>
                    <time className={`text-xs font-black sm:hidden ${current ? "text-coral" : "text-muted"}`}>{timingLabel ?? formatEventTime(item.starts_at, item.timezone).split(",").at(-1)}</time>
                    <div className="min-w-0"><span className={`mb-2 inline-flex rounded-full px-2 py-1 text-[.6rem] font-black uppercase tracking-[.12em] ${current ? "bg-coral text-white" : "bg-surface text-muted"}`}>{phaseForActive(item, current)}</span><h3 className="font-display text-lg font-black">{item.title}</h3><p className="mt-1 text-xs capitalize text-muted">{(item.event_type ?? "custom").replaceAll("_", " ")} · {(item.event_status ?? "planned").replaceAll("_", " ")}</p>{end && <p className="mt-1 text-xs text-muted">{end.journey ? "Arrives" : "Ends"} {formatEventTime(end.endsAt, endTimeZone)} · {end.duration}</p>}</div>
                    <EventTravelers item={item} travelerIds={travelerIds} travelers={travelers} />
                    {item.location?.label && <p className="mt-3 flex items-start gap-2 text-sm text-muted"><MapPin className="mt-0.5 size-4 shrink-0" />{item.location.label}</p>}
                    <div className="mt-3 flex flex-wrap gap-3">{map ? <a href={map} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-brand"><LocateFixed className="size-4" /> Navigation</a> : editable && !isJourneyEventType(item.event_type) ? <button type="button" onClick={(event) => { event.stopPropagation(); setEditingItinerary(item); }} className="inline-flex items-center gap-1.5 text-xs font-extrabold text-warning"><MapPin className="size-4" /> Add location</button> : null}</div>
                    {booking && <BookingEventSummary booking={booking} flights={flights} journeys={journeys} />}
                    <span className="mt-4 flex items-center justify-end gap-1 text-xs font-extrabold text-brand">View details <ChevronRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
                  </FocusSurface>
                </div>
              </Fragment>;
            })}
            {visibleItinerary.length === 0 && <button type="button" disabled={!editable} onClick={() => setOpenForm("event")} className="w-full rounded-2xl border border-dashed border-line p-8 text-sm text-muted">{editable ? focusedTraveler ? `No events apply to ${focusedTraveler.display_name}. Add one for them.` : "Your timeline is empty. Add the first event." : "No relevant timeline events have been added yet."}</button>}
          </div>
        </section>
      </main> : <main className="mt-5 space-y-5">
        <nav className="flex gap-2 overflow-auto pb-1">{[["overview","Overview"],["reservations","Reservations"],["costs","Costs"],["people","People"],["readiness","Readiness"],["documents","Documents"],["archived","Archived"],["offline","Offline"],["metadata","Travel data"],["notes","Notes"]].map(([id, label]) => <a className="shrink-0 rounded-full border border-line bg-surface px-3 py-2 text-xs font-bold" key={id} href={`#${id}`}>{label}</a>)}</nav>
        <Section id="overview" eyebrow="Overview" title="Trip information" action={isOwner && <button type="button" onClick={() => setOpenForm("settings")} className="secondary-button"><Settings className="size-4" /> Edit</button>}><dl className="grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-muted">Destination</dt><dd className="mt-1 font-bold">{trip.destination_summary}</dd></div><div><dt className="text-muted">Dates</dt><dd className="mt-1 font-bold">{formatDateRange(trip.start_date, trip.end_date)}</dd></div><div><dt className="text-muted">Default currency</dt><dd className="mt-1 font-bold">{trip.base_currency}</dd></div><div><dt className="text-muted">Fallback time zone</dt><dd className="mt-1 font-bold">{trip.primary_timezone}</dd></div></dl></Section>
        <Section id="reservations" eyebrow="Bookings" title={focusedTraveler ? `${focusedTraveler.display_name}'s reservations` : "Reservations"} action={editable && <button type="button" className="secondary-button" onClick={() => setOpenForm("event")}><Plus className="size-4" /> Add</button>}><div className="grid gap-3 sm:grid-cols-2">{visibleBookings.map((booking) => { const flight = flightByBooking.get(booking.id); const href = flight ? `/trips/${trip.id}/flights/${flight.id}` : `/trips/${trip.id}/bookings/${booking.id}`; const phone = booking.contact_phone ? phoneActionUrls(booking.contact_phone) : null; const bookingFlights = flights.filter((leg) => leg.booking_id === booking.id).sort((a, b) => a.segment_order - b.segment_order); const bookingJourneys = journeys.filter((leg) => leg.booking_id === booking.id).sort((a, b) => a.segment_order - b.segment_order); const route = bookingFlights.length ? journeyRoute(bookingFlights.map((leg) => ({ origin: leg.departure_airport_code || leg.departure_airport_name, destination: leg.arrival_airport_code || leg.arrival_airport_name }))) : journeyRoute(bookingJourneys.map((leg) => ({ origin: leg.origin_code || leg.origin_name, destination: leg.destination_code || leg.destination_name }))); return <article className="rounded-2xl border border-line bg-elevated p-4" key={booking.id}><p className="text-xs font-bold uppercase tracking-[.12em] text-muted">{booking.type}{booking.journey_scope ? ` · ${booking.journey_scope}` : ""}</p><Link to={href} className="mt-2 block font-display text-lg font-black text-brand">{booking.title}</Link>{route && <p className="mt-1 text-sm font-black text-ink">{route}</p>}<p className="mt-1 text-xs text-muted">{booking.provider}{booking.reference_code ? ` · ${booking.reference_code}` : ""}{booking.booked_via_name ? ` · via ${booking.booked_via_name}` : ""}</p>{phone && <div className="mt-3 flex gap-3"><a className="text-xs font-extrabold text-brand" href={phone.call}>Call</a><a className="text-xs font-extrabold text-success" href={phone.whatsapp} target="_blank" rel="noreferrer">WhatsApp</a></div>}</article>; })}{visibleBookings.length === 0 && <p className="col-span-full text-sm text-muted">No relevant reservations yet.</p>}</div></Section>
        <Section id="costs" eyebrow="Money" title={focusedTraveler ? `${focusedTraveler.display_name}'s trip costs` : "Trip expenses"} action={editable && <button type="button" className="secondary-button" onClick={() => { setCostTargetItem(null); setOpenForm("cost"); }}><Plus className="size-4" /> Add</button>}><CostTotals costs={visibleCosts} />{balances.length > 0 && <div className="mt-4 rounded-2xl border border-line p-4"><p className="eyebrow">Balances by currency</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{balances.map((balance) => <div key={`${balance.currencyCode}:${balance.travelerId}`} className="flex justify-between rounded-xl bg-elevated px-3 py-2 text-sm"><span>{travelers.find((traveler) => traveler.id === balance.travelerId)?.display_name ?? "Traveler"}</span><strong className={balance.amountMinor > 0 ? "text-success" : "text-warning"}>{balance.amountMinor > 0 ? "gets " : "owes "}{formatMoney(Math.abs(balance.amountMinor), balance.currencyCode)}</strong></div>)}</div><p className="mt-3 text-xs text-muted">Positive means this traveler should receive money; negative means they owe money. Different currencies are never silently combined.</p></div>}<div className="mt-4 space-y-2">{visibleCosts.map((cost) => <div className="flex flex-wrap items-center gap-2 rounded-xl bg-elevated p-3 text-sm" key={cost.id}><span className="min-w-0 flex-1 truncate">{cost.title}</span>{cost.paid_by_traveler_id && <span className="text-xs text-muted">Paid by {travelers.find((traveler) => traveler.id === cost.paid_by_traveler_id)?.display_name ?? "traveler"}</span>}<strong>{cost.amount_minor === 0 ? "Free" : formatMoney(cost.amount_minor, cost.currency_code)}</strong>{editable && <><button type="button" onClick={() => setEditingCost(cost)} aria-label={`Edit ${cost.title}`}><Pencil className="size-4" /></button><button type="button" className="text-danger" onClick={() => window.confirm(`Archive ${cost.title}? You can restore it from Archived trip items.`) && archiveCost.mutate(cost)} aria-label={`Archive ${cost.title}`}><Trash2 className="size-4" /></button></>}</div>)}</div></Section>
        <Section id="people" eyebrow="People & sharing" title={focusedTravelerId ? travelers.find((row) => row.id === focusedTravelerId)?.display_name ?? "Selected traveler" : "Everyone"} action={<button type="button" className="secondary-button" onClick={() => setOpenForm("people")}><UsersRound className="size-4" /> Open</button>}><p className="text-sm text-muted">Switch between the complete trip and one person's relevant timeline, reservations, costs, readiness, seats, and documents.</p></Section>
        <Section id="readiness" eyebrow="Before departure" title="Readiness"><p className="text-sm text-muted">{readiness.resolved} of {readiness.total} checks resolved.</p><Link className="mt-4 inline-flex text-sm font-extrabold text-brand" to={`/trips/${trip.id}/readiness`}>Open readiness checklist →</Link></Section>
        <Section id="documents" eyebrow="Vault" title="Documents" action={<button type="button" className="secondary-button" onClick={() => setOpenForm("document")}><Plus className="size-4" /> Upload</button>}><p className="text-sm text-muted">{focusedDocuments.length} document{focusedDocuments.length === 1 ? "" : "s"} {focusedTravelerId ? "for the selected traveler" : "in this trip"}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{focusedDocuments.map((document) => <Link key={document.id} to={`/trips/${trip.id}/documents/${document.id}`} className="rounded-xl bg-elevated p-3 text-sm font-bold text-brand">{document.title}</Link>)}</div></Section>
        <Section id="archived" eyebrow="Recoverable" title="Archived trip items"><p className="text-sm text-muted">Archived events and booking groups leave the timeline, while their documents and costs stay available. Archived costs can also be restored here.</p><div className="mt-4 space-y-2">{archivedItemsQuery.data?.map((item) => <div key={`${item.kind}:${item.id}`} className="flex items-center gap-3 rounded-xl bg-elevated p-3 text-sm"><span className="min-w-0 flex-1"><strong className="block">{item.title}</strong><span className="text-xs capitalize text-muted">{item.kind}</span></span>{editable && <button type="button" className="secondary-button min-h-9 px-3 py-2 text-xs" disabled={restoreArchivedItem.isPending} onClick={() => restoreArchivedItem.mutate({ id: item.id, kind: item.kind })}><RotateCcw className="size-3.5" /> Restore</button>}</div>)}{!navigator.onLine && <p className="rounded-xl bg-warning/10 p-3 text-sm text-warning">Connect to view and restore archived items.</p>}{navigator.onLine && archivedItemsQuery.data?.length === 0 && <p className="text-sm text-muted">Nothing is archived.</p>}</div></Section>
        <Section id="offline" eyebrow="On this device" title="Offline pack"><OfflinePackControl tripId={trip.id} /></Section>
        <Section id="metadata" eyebrow="Travel metadata" title="Airlines"><TripAirlinesPanel tripId={trip.id} canEdit={editable} /></Section>
        <Section id="notes" eyebrow="Useful details" title="Notes" action={editable && <button type="button" className="secondary-button" onClick={() => setOpenForm("note")}><Plus className="size-4" /> Add</button>}><div className="space-y-3">{notesQuery.data?.map((note) => <article className="rounded-xl bg-elevated p-4" key={note.id}><div className="flex justify-between gap-3"><div><p className="font-bold">{note.title || "Note"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted">{note.body}</p></div>{editable && <div className="flex"><button type="button" className="grid size-9 place-items-center" onClick={() => setEditingNote(note)} aria-label="Edit note"><Pencil className="size-4" /></button><button type="button" className="grid size-9 place-items-center text-danger" onClick={() => window.confirm("Archive this note?") && archiveNoteMutation.mutate(note)} aria-label="Archive note"><Trash2 className="size-4" /></button></div>}</div></article>)}{notesQuery.data?.length === 0 && <p className="text-sm text-muted">No notes yet.</p>}</div></Section>
      </main>}

      <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-focus backdrop-blur sm:bottom-6">{editable && <button type="button" onClick={() => setOpenForm("event")} className="primary-button min-h-11 whitespace-nowrap px-3 sm:px-4" aria-label="Add event"><CalendarPlus className="size-4" /><span>Add event</span></button>}<button type="button" onClick={() => setOpenForm("people")} className="secondary-button size-11 justify-center px-0 sm:size-auto sm:px-4" aria-label={`People and sharing · ${focusedTraveler?.display_name ?? "Everyone"}`}>{focusedTraveler ? <span className="grid size-6 place-items-center rounded-full bg-brand text-[.55rem] font-black text-surface">{focusedTraveler.display_name.slice(0, 2).toUpperCase()}</span> : <UsersRound className="size-4" />}<span className="hidden max-w-32 truncate sm:inline">{focusedTraveler?.display_name ?? "Everyone"}</span></button><button type="button" onClick={() => view === "details" ? changeView("timeline") : changeView("details")} className="tap-target grid size-11 place-items-center rounded-xl border border-line text-brand" aria-label={view === "details" ? "Open timeline" : "Open trip details"}>{view === "details" ? <CalendarClock className="size-5" /> : <Info className="size-5" />}</button>{view === "timeline" && activeItem && <button type="button" onClick={() => scrollToItem(activeItem.id)} className="tap-target grid size-11 place-items-center rounded-xl border border-line text-brand" aria-label="Jump to now or next"><LocateFixed className="size-5" /></button>}</div>
    </>}
  </div>
  {trip && viewingItinerary && <EventDetailsSheet item={viewingItinerary} tripId={trip.id} booking={viewingItinerary.booking_id ? visibleBookings.find((booking) => booking.id === viewingItinerary.booking_id) : undefined} flights={flights} journeys={journeys} travelerIds={participantRows.filter((row) => row.itinerary_item_id === viewingItinerary.id).map((row) => row.traveler_id)} travelers={travelers} costs={visibleCosts} focusedTravelerId={focusedTravelerId} editable={editable} canMoveUp={viewingItineraryIndex > 0 && itinerary[viewingItineraryIndex - 1]?.starts_at === viewingItinerary.starts_at} canMoveDown={viewingItineraryIndex >= 0 && itinerary[viewingItineraryIndex + 1]?.starts_at === viewingItinerary.starts_at} onClose={() => setViewingItineraryId(null)} onEdit={() => setEditingItinerary(viewingItinerary)} onArchive={() => { if (window.confirm(`Archive ${viewingItinerary.title}? ${viewingItinerary.booking_id ? "Its complete booking group leaves the timeline." : "It leaves the timeline."} Linked documents and costs remain.`)) { setViewingItineraryId(null); archiveItinerary.mutate(viewingItinerary); } }} onAddBooking={() => setActivityBookingTarget(viewingItinerary)} onAddCost={() => { setCostTargetItem(viewingItinerary); setOpenForm("cost"); }} onEditCost={(cost) => setEditingCost(cost)} onUploadDocument={() => { setDocumentTargetItem(viewingItinerary); setOpenForm("document"); }} onStatus={(status) => updateEventStatus.mutate({ item: viewingItinerary, status })} onMoveUp={() => reorderItinerary.mutate({ itemId: viewingItinerary.id, direction: "up" })} onMoveDown={() => reorderItinerary.mutate({ itemId: viewingItinerary.id, direction: "down" })} />}
  {trip && openForm === "event" && editable && <AddEventForm trip={trip} travelers={travelers} preferredTravelerId={focusedTravelerId ?? undefined} onClose={closeForm} />}
  {trip && openForm === "people" && <PeopleSheet trip={trip} travelers={travelers} members={members} selectedId={focusedTravelerId} editable={editable} isOwner={isOwner} onSelect={chooseTraveler} onAdd={() => setOpenForm("traveler")} onShare={() => setOpenForm("share")} onClose={closeForm} onRefresh={() => void membersQuery.refetch()} />}
  {trip && openForm === "cost" && editable && <AddCostForm trip={trip} travelers={travelers} bookingId={costTargetItem?.booking_id ?? undefined} itineraryItemId={costTargetItem?.id} sourceTitle={costTargetItem?.title} onClose={closeForm} />}
  {trip && openForm === "document" && <UploadDocumentForm trip={trip} travelers={travelers} preferredTravelerId={focusedTravelerId ?? undefined} members={members} privateOnly={!editable} bookingId={documentTargetItem?.booking_id ?? undefined} contextTitle={documentTargetItem?.title} onUploaded={documentTargetItem ? async (documentId) => { await attachDocumentsToEvent(documentTargetItem, [documentId]); await queryClient.invalidateQueries({ queryKey: ["event-documents", documentTargetItem.id] }); } : undefined} onClose={closeForm} />}
  {trip && openForm === "traveler" && editable && <AddTravelerForm trip={trip} onClose={closeForm} />}
  {trip && openForm === "share" && isOwner && <ShareTripForm trip={trip} travelers={travelers} onClose={closeForm} />}
  {trip && openForm === "requirement" && editable && <AddRequirementForm trip={trip} travelers={travelers} preferredTravelerId={focusedTravelerId ?? undefined} onClose={closeForm} />}
  {trip && openForm === "note" && editable && <AddNoteForm trip={trip} onClose={closeForm} />}
  {trip && openForm === "settings" && isOwner && <TripSettingsForm trip={trip} onClose={closeForm} onArchived={() => navigate("/trips")} />}
  {trip && activityBookingTarget && editable && <AddActivityBookingForm trip={trip} item={activityBookingTarget} travelers={travelers} eventTravelerIds={participantRows.filter((row) => row.itinerary_item_id === activityBookingTarget.id).map((row) => row.traveler_id)} onClose={() => setActivityBookingTarget(null)} />}
  {trip && editingItinerary && editable && <AddItineraryForm trip={trip} item={editingItinerary} travelers={travelers} bookings={bookings} onClose={() => setEditingItinerary(null)} />}
  {trip && editingCost && editable && <AddCostForm trip={trip} travelers={travelers} cost={editingCost} onClose={() => setEditingCost(null)} />}
  {trip && editingTraveler && editable && <EditTravelerForm trip={trip} traveler={editingTraveler} onClose={() => setEditingTraveler(null)} />}
  </AppShell>;
}
