import { BookingDisclosure, BookingDocuments } from "../features/workspace/BookingDetailSections";
import { BookingCosts } from "../features/workspace/BookingCosts";
import { FormSection } from "../components/FormSection";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock3,
  LocateFixed,
  Luggage,
  Pencil,
  Phone,
  Plane,
  Plus,
  Radar,
  Save,
  UserRound
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { TripBackLink } from "../components/TripBackLink";
import { DocumentVisibilityIcon } from "../components/DocumentVisibilityIcon";
import { DocumentTypeIcon } from "../components/DocumentTypeIcon";
import { ModalSheet } from "../components/ModalSheet";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { isoToLocalDateTime, localDateTimeToIso } from "../features/trips/validation";
import { formatEventTime, getErrorMessage } from "../features/trips/presentation";
import {
  getBooking,
  getFlightLeg,
  googleMapsDirectionsUrl,
  listBookingTravelerIds,
  listFlightLegsForBooking,
  listTripAirlines,
  updateFlightLeg
} from "../features/workspace/api";
import {
  delayMinutes,
  flightCountdown,
  primaryFlightDocument,
  resolveBoardingInstant,
  toDateTimeLocal,
  trackerUrl
} from "../features/workspace/flight";
import { flightStatuses } from "../features/workspace/types";
import { UploadDocumentForm } from "../features/workspace/WorkspaceForms";
import { FlightTravelerDetails } from "../features/workspace/FlightTravelerDetails";
import { SafeExternalAction } from "../components/SafeExternalAction";
import { expandActionUrl, validateActionUrl } from "../features/admin/validation";
import { localProfileId } from "../features/sync/localSync";
import {
  arrivalDayOffset,
  journeyDuration,
  journeyRoute,
  phoneActionUrls
} from "../features/timeline/model";
import { documentMatchesTraveler } from "../features/workspace/documentModel";
import { readTravelerFocus } from "../features/workspace/travelerFocus";
import { AddFlightConnectionForm } from "../features/workspace/AddFlightConnectionForm";
import { airlineAccentStyle, airlineForFlight } from "../features/workspace/airlineAccent";
import { tripChildNavigationState, tripReturnNavigation } from "../features/trips/navigation";
import { tripQueries } from "../features/queries/tripQueries";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { EventTimeZoneField, furthestEventTimezone } from "../features/timeline/TimingFields";
import { EventSilhouette } from "../components/EventSilhouette";

type FlightEditTarget =
  | "status"
  | "scheduledDeparture"
  | "scheduledArrival"
  | "boardingAt"
  | "arrivalTerminal";

export function FlightPage() {
  const { tripId = "", flightLegId = "" } = useParams();
  const currentLocation = useLocation();
  const locationState = currentLocation.state;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editTarget, setEditTarget] = useState<FlightEditTarget>("status");
  const [editMessage, setEditMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [addingConnection, setAddingConnection] = useState(false);
  const [userId, setUserId] = useState("");
  useEffect(() => {
    void localProfileId().then((profileId) => setUserId(profileId ?? ""));
  }, []);
  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ ...tripQueries.members(tripId), enabled: Boolean(tripId) });
  const airlinesQuery = useQuery({
    queryKey: ["trip-airlines", tripId],
    queryFn: () => listTripAirlines(tripId),
    enabled: Boolean(tripId)
  });
  const flightQuery = useQuery({
    queryKey: ["flight", flightLegId],
    queryFn: () => getFlightLeg(flightLegId),
    enabled: Boolean(flightLegId)
  });
  const documentsQuery = useQuery({ ...tripQueries.documents(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ ...tripQueries.itinerary(tripId), enabled: Boolean(tripId) });
  const flight = flightQuery.data;
  const bookingQuery = useQuery({
    queryKey: ["booking", flight?.booking_id],
    queryFn: () => getBooking(flight!.booking_id),
    enabled: Boolean(flight?.booking_id)
  });
  const bookingTravelersQuery = useQuery({
    queryKey: ["booking-traveler-ids", flight?.booking_id],
    queryFn: () => listBookingTravelerIds(flight!.booking_id, tripId),
    enabled: Boolean(flight?.booking_id && tripId)
  });
  const connectionsQuery = useQuery({
    queryKey: ["flight-legs", tripId, flight?.booking_id],
    queryFn: () => listFlightLegsForBooking(flight!.booking_id, tripId),
    enabled: Boolean(flight?.booking_id && tripId)
  });
  const booking = bookingQuery.data;
  const hasNavigationLocation = Boolean(
    booking?.location?.map_url ||
    booking?.location?.address ||
    booking?.location?.label ||
    (typeof booking?.location?.latitude === "number" &&
      typeof booking?.location?.longitude === "number")
  );
  const showTimeZoneControls = (booking?.journey_scope ?? flight?.journey_scope) !== "domestic";
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role;
  const editable = role === "owner" || role === "editor";
  const airline = flight ? airlineForFlight(flight, airlinesQuery.data ?? []) : undefined;
  const airlineStyle = airlineAccentStyle(airline?.brand_color);
  const actionValues: Record<string, string> = flight
    ? {
        flightNumber: flight.flight_number.replace(/\s+/g, ""),
        airlineCode: airline?.iata_code ?? "",
        departureDate: flight.scheduled_departure_at.slice(0, 10),
        bookingReference: booking?.reference_code ?? "",
        departureAirport: flight.departure_airport_code ?? flight.departure_airport_name,
        arrivalAirport: flight.arrival_airport_code ?? flight.arrival_airport_name
      }
    : {};
  const actionUrl = (template?: string | null) =>
    template && validateActionUrl(template) ? expandActionUrl(template, actionValues) : null;
  const focusedTravelerId = readTravelerFocus(tripId);
  const documents = (documentsQuery.data ?? []).filter(
    (document) =>
      (document.flight_leg_id === flightLegId || document.booking_id === flight?.booking_id) &&
      (!focusedTravelerId || documentMatchesTraveler(document, focusedTravelerId))
  );
  const primary = primaryFlightDocument(documents);
  const baggageTags = documents.filter((document) => document.purpose === "baggage_tag");
  const phoneActions = booking?.contact_phone ? phoneActionUrls(booking.contact_phone) : null;
  const boardingInstant = flight
    ? resolveBoardingInstant(
        flight.scheduled_departure_at,
        flight.boarding_at,
        flight.boarding_lead_minutes
      )
    : null;
  const bookingTravelerIds = bookingTravelersQuery.data ?? [];
  const bookingTravelers =
    booking?.participant_scope === "selected" || bookingTravelerIds.length > 0
      ? (travelersQuery.data ?? []).filter((traveler) => bookingTravelerIds.includes(traveler.id))
      : (travelersQuery.data ?? []);
  const dayOffset = flight
    ? arrivalDayOffset(
        flight.scheduled_departure_at,
        flight.departure_timezone,
        flight.scheduled_arrival_at,
        flight.arrival_timezone
      )
    : 0;
  const connectionLegs = (connectionsQuery.data ?? (flight ? [flight] : []))
    .slice()
    .sort((left, right) => left.segment_order - right.segment_order);
  const fullRoute = journeyRoute(
    connectionLegs.map((leg) => ({
      origin: leg.departure_airport_code || leg.departure_airport_name,
      destination: leg.arrival_airport_code || leg.arrival_airport_name
    }))
  );
  const returnNavigation = tripReturnNavigation(locationState, tripId);
  const nestedNavigationState = tripChildNavigationState(
    locationState,
    tripId,
    returnNavigation.view,
    `${currentLocation.pathname}${currentLocation.search}`
  );
  const openEditor = (target: FlightEditTarget) => {
    setEditTarget(target);
    setEditing(true);
  };
  useEffect(() => {
    if (!editing) return;
    const frame = window.requestAnimationFrame(() => {
      const control = document.querySelector<HTMLElement>(`[name="${editTarget}"]`);
      control?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      control?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editing, editTarget]);
  const mutation = useMutation({
    mutationFn: updateFlightLeg,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["flight", flightLegId] }),
        queryClient.invalidateQueries({ queryKey: ["flights", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["bookings", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] })
      ]);
      setEditMessage("");
      setEditing(false);
    }
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!flight) return;
    setEditMessage("");
    const form = new FormData(event.currentTarget);
    const convert = (name: string, timezone: string) => {
      const value = String(form.get(name) ?? "");
      const occurrence = String(form.get(`${name}Occurrence`) ?? "automatic") as
        | "automatic"
        | "earlier"
        | "later";
      return value ? localDateTimeToIso(value, timezone, occurrence) : null;
    };
    try {
      const eventTimezone = showTimeZoneControls
        ? undefined
        : String(form.get("eventTimezone") ?? "").trim() || flight.departure_timezone;
      const departureTimezone = eventTimezone ?? flight.departure_timezone;
      const arrivalTimezone = eventTimezone ?? flight.arrival_timezone;
      const scheduledDeparture = convert("scheduledDeparture", departureTimezone);
      const scheduledArrival = convert("scheduledArrival", arrivalTimezone);
      if (!scheduledDeparture || !scheduledArrival)
        throw new Error("Scheduled departure and arrival are required.");
      if (scheduledArrival <= scheduledDeparture)
        throw new Error("Arrival must be after departure after both local times are converted.");
      const reordered = (connectionsQuery.data ?? [flight])
        .map((leg) =>
          leg.id === flight.id
            ? {
                ...leg,
                scheduled_departure_at: scheduledDeparture,
                scheduled_arrival_at: scheduledArrival
              }
            : eventTimezone
              ? {
                  ...leg,
                  scheduled_departure_at: localDateTimeToIso(
                    isoToLocalDateTime(leg.scheduled_departure_at, leg.departure_timezone),
                    eventTimezone,
                    "earlier"
                  ),
                  scheduled_arrival_at: localDateTimeToIso(
                    isoToLocalDateTime(leg.scheduled_arrival_at, leg.arrival_timezone),
                    eventTimezone,
                    "earlier"
                  )
                }
              : leg
        )
        .sort((left, right) => left.segment_order - right.segment_order);
      for (let index = 1; index < reordered.length; index += 1)
        if (reordered[index].scheduled_departure_at < reordered[index - 1].scheduled_arrival_at)
          throw new Error(`Connection ${index + 1} departs before the previous flight arrives.`);
      const boardingAt = convert("boardingAt", departureTimezone);
      if (boardingAt && boardingAt > scheduledDeparture)
        throw new Error("Boarding cannot be after departure.");
      const boardingLeadValue = String(form.get("boardingLeadMinutes") ?? "").trim();
      const boardingLeadMinutes = boardingLeadValue ? Number(boardingLeadValue) : null;
      if (
        boardingLeadMinutes !== null &&
        (!Number.isInteger(boardingLeadMinutes) ||
          boardingLeadMinutes < 0 ||
          boardingLeadMinutes > 360)
      )
        throw new Error("Boarding lead must be a whole number from 0 to 360 minutes.");
      mutation.mutate({
        id: flight.id,
        tripId,
        version: flight.version,
        status: String(form.get("status")) as never,
        eventTimezone,
        scheduled_departure_at: scheduledDeparture,
        scheduled_arrival_at: scheduledArrival,
        estimated_departure_at: convert("estimatedDeparture", departureTimezone),
        estimated_arrival_at: convert("estimatedArrival", arrivalTimezone),
        actual_departure_at: convert("actualDeparture", departureTimezone),
        actual_arrival_at: convert("actualArrival", arrivalTimezone),
        boarding_at: boardingAt,
        boarding_lead_minutes: boardingLeadMinutes,
        departure_terminal: String(form.get("departureTerminal") ?? ""),
        departure_gate: String(form.get("departureGate") ?? ""),
        arrival_terminal: String(form.get("arrivalTerminal") ?? ""),
        arrival_gate: String(form.get("arrivalGate") ?? ""),
        baggage_claim: String(form.get("baggageClaim") ?? ""),
        status_note: String(form.get("statusNote") ?? "")
      });
    } catch (error) {
      setEditMessage(getErrorMessage(error));
    }
  };

  return (
    <AppShell>
      <div className="mx-auto min-w-0 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <TripBackLink {...returnNavigation} />
          {flight && editable && (
            <button
              type="button"
              onClick={() => openEditor("status")}
              className="tap-target inline-flex shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand hover:bg-brand-soft"
            >
              <Pencil aria-hidden="true" className="size-4" /> Edit flight
            </button>
          )}
        </div>
        {flightQuery.isLoading && <LoadingCard label="Loading flight" />}
        {flightQuery.error && <ErrorCard error={flightQuery.error} />}
        {flight && (
          <>
            <section
              style={airlineStyle}
              className={`event-hero event-type-icon--flight airline-accent-hero page-enter mt-3 overflow-hidden rounded-xl border text-white shadow-focus ${flight.status === "cancelled" ? "event-hero--cancelled border-danger" : flight.status === "delayed" ? "border-warning" : "border-line"}`}
            >
              <EventSilhouette key={flight.id} type="flight" placement="hero" />
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.14em]">
                    {flight.status.replace("_", " ")}
                  </span>
                  <Plane className="size-6" />
                </div>
                <div className="mt-3 flex items-end justify-between gap-6">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-white/85">
                      <span className="airline-accent-dot" aria-hidden="true" />
                      {flight.airline_name} · {flight.flight_number}
                    </p>
                    <h1 className="mt-2 break-words font-display text-2xl font-black tracking-[-.045em]">
                      {fullRoute}
                    </h1>
                  </div>
                </div>
                {connectionLegs.length > 1 && (
                  <div className="mt-3">
                    <p className="text-[.65rem] font-black uppercase tracking-[.14em] text-white/85">
                      Connected journey
                    </p>
                    <nav
                      aria-label="Flight connections"
                      className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1"
                    >
                      {connectionLegs.map((leg) => {
                        const legAirline = airlineForFlight(leg, airlinesQuery.data ?? []);
                        const selected = leg.id === flight.id;
                        return (
                          <Link
                            key={leg.id}
                            to={`/trips/${tripId}/flights/${leg.id}`}
                            state={locationState}
                            aria-current={selected ? "page" : undefined}
                            style={airlineAccentStyle(legAirline?.brand_color)}
                            className={`relative min-w-0 rounded-lg px-2 py-2.5 text-center text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${selected ? "bg-surface text-ink shadow-sm after:absolute after:bottom-0 after:left-1/4 after:h-0.5 after:w-1/2 after:rounded-full after:bg-brand" : "text-white/85 hover:bg-white/10"}`}
                          >
                            <strong className="block break-words text-sm">
                              {leg.departure_airport_code || leg.departure_airport_name} →{" "}
                              {leg.arrival_airport_code || leg.arrival_airport_name}
                            </strong>
                            <span
                              className={`mt-1 flex items-center justify-center gap-1.5 ${selected ? "text-muted" : "text-white/85"}`}
                            >
                              <span className="airline-accent-dot shrink-0" aria-hidden="true" />
                              <span className="min-w-0 break-words">{leg.flight_number}</span>
                            </span>
                            <span className="sr-only">
                              {leg.airline_name}
                              {selected ? " · Selected flight" : " · View flight"}
                            </span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                )}
                <p className="mt-3 flex items-center gap-2 font-bold">
                  <Clock3 className="size-5" />
                  {flightCountdown(flight)}
                </p>
                {delayMinutes(flight) > 0 && (
                  <p className="mt-2 text-sm font-semibold text-white/90">
                    Manual estimate: {delayMinutes(flight)} minutes later than scheduled
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {hasNavigationLocation && (
                    <a
                      className="hero-action hero-shortcut hero-shortcut--label"
                      href={
                        booking?.location?.map_url || googleMapsDirectionsUrl(booking!.location!)
                      }
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Navigate to booking location"
                      title="Navigate to booking location"
                    >
                      <LocateFixed className="size-4" aria-hidden="true" />
                      <span>Navigate</span>
                    </a>
                  )}
                  {primary && (
                    <Link
                      className="hero-action hero-shortcut"
                      to={`/trips/${tripId}/documents/${primary.id}`}
                      state={nestedNavigationState}
                      aria-label={
                        primary.purpose === "boarding_pass" ? "Open boarding pass" : "Open ticket"
                      }
                      title={
                        primary.purpose === "boarding_pass" ? "Open boarding pass" : "Open ticket"
                      }
                    >
                      <DocumentTypeIcon type={primary.category} size="sm" variant="monochrome" />
                      <span className="hidden md:inline">
                        {primary.purpose === "boarding_pass" ? "Open boarding pass" : "Open ticket"}
                      </span>
                    </Link>
                  )}
                </div>
              </div>
            </section>
            <section
              aria-label="Flight schedule"
              className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line"
            >
              {connectionLegs.length > 1 && (
                <h2 className="col-span-2 flex items-center gap-2 bg-surface px-3 py-2 text-sm font-bold">
                  <Plane className="size-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>
                    Connection {connectionLegs.findIndex((leg) => leg.id === flight.id) + 1} ·{" "}
                    {flight.departure_airport_code || flight.departure_airport_name} →{" "}
                    {flight.arrival_airport_code || flight.arrival_airport_name}
                  </span>
                </h2>
              )}
              <Info
                label="Departure"
                value={formatEventTime(flight.scheduled_departure_at, flight.departure_timezone)}
                detail={`${flight.departure_airport_name} · ${flight.departure_timezone}`}
                onEdit={editable ? () => openEditor("scheduledDeparture") : undefined}
              />
              <Info
                label="Arrival"
                value={`${formatEventTime(flight.scheduled_arrival_at, flight.arrival_timezone)}${dayOffset > 0 ? ` · +${dayOffset} day` : dayOffset < 0 ? ` · ${dayOffset} day` : ""}`}
                detail={`${flight.arrival_airport_name} · ${flight.arrival_timezone} · ${journeyDuration(flight.scheduled_departure_at, flight.scheduled_arrival_at)}`}
                onEdit={editable ? () => openEditor("scheduledArrival") : undefined}
              />
              <Info
                label="Boarding"
                value={
                  boardingInstant
                    ? new Intl.DateTimeFormat(undefined, {
                        timeStyle: "short",
                        timeZone: flight.departure_timezone
                      }).format(new Date(boardingInstant))
                    : "Not added"
                }
                detail={[
                  flight.boarding_at
                    ? "Exact boarding time"
                    : flight.boarding_lead_minutes != null
                      ? `${flight.boarding_lead_minutes} min before departure`
                      : null,
                  flight.departure_terminal ? `Terminal ${flight.departure_terminal}` : null,
                  flight.departure_gate ? `Gate ${flight.departure_gate}` : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onEdit={editable ? () => openEditor("boardingAt") : undefined}
              />
              <Info
                label="Arrival details"
                value={
                  flight.arrival_terminal
                    ? `Terminal ${flight.arrival_terminal}`
                    : "Terminal not added"
                }
                detail={[
                  flight.arrival_gate ? `Gate ${flight.arrival_gate}` : null,
                  flight.baggage_claim ? `Baggage ${flight.baggage_claim}` : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
                onEdit={editable ? () => openEditor("arrivalTerminal") : undefined}
              />
            </section>
            {booking && (
              <section
                style={airlineStyle}
                className="airline-accent-rail rounded-xl border border-line bg-surface mt-3 p-3 pl-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="eyebrow">Booking</p>
                    <p className="mt-2 font-display text-xl font-black">
                      PNR {booking.reference_code || "not added"}
                      {booking.reference_code && (
                        <button
                          type="button"
                          className="ml-2 inline-flex min-h-11 items-center px-2 text-xs font-bold text-brand"
                          onClick={() => navigator.clipboard.writeText(booking.reference_code!)}
                          aria-label="Copy PNR"
                        >
                          Copy
                        </button>
                      )}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {booking.journey_scope ? `${booking.journey_scope} · ` : ""}
                      {booking.booked_via_name
                        ? `Booked via ${booking.booked_via_name}`
                        : "Booked directly / source not added"}
                    </p>
                  </div>
                  {booking.booked_via_url && (
                    <a
                      className="secondary-button"
                      href={booking.booked_via_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open booking
                    </a>
                  )}
                </div>
                {booking.contact_phone && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <Phone className="size-4 text-brand" />
                    <strong>{booking.contact_name || booking.contact_phone}</strong>
                    {phoneActions && (
                      <>
                        <a className="secondary-button" href={phoneActions.call}>
                          Call
                        </a>
                        <a
                          className="secondary-button"
                          href={phoneActions.whatsapp}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <WhatsAppIcon /> WhatsApp
                        </a>
                      </>
                    )}
                  </div>
                )}
              </section>
            )}
            {flight.status === "landed" && (
              <section className="mt-3 rounded-xl border border-success/30 bg-surface p-3">
                <p className="flex items-center gap-2 font-display text-xl font-black">
                  <Luggage className="size-5 text-success" /> Baggage collection
                </p>
                <p className="mt-2 text-sm text-muted">
                  Claim: {flight.baggage_claim || "Not entered yet"}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {baggageTags.map((tag) => (
                    <div key={tag.id} className="flex items-center gap-2">
                      <Link
                        className="secondary-button"
                        to={`/trips/${tripId}/documents/${tag.id}`}
                        state={nestedNavigationState}
                      >
                        <DocumentTypeIcon type={tag.category} size="sm" />
                        {tag.short_label || tag.title}
                      </Link>
                      <DocumentVisibilityIcon
                        interactive
                        visibility={tag.visibility}
                        documentTitle={tag.title}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
            <div className="mt-3">
              <BookingDocuments
                documents={documents}
                travelers={travelersQuery.data ?? []}
                focusedTravelerId={focusedTravelerId}
                navigationState={nestedNavigationState}
                onUpload={() => setUploading(true)}
              />
            </div>
            <div className="mt-3">
              {" "}
              {flight && (
                <FlightTravelerDetails
                  tripId={tripId}
                  flightLegId={flight.id}
                  travelers={
                    focusedTravelerId
                      ? bookingTravelers.filter((traveler) => traveler.id === focusedTravelerId)
                      : bookingTravelers
                  }
                  canEdit={editable}
                />
              )}
            </div>
            <div className="mt-3 space-y-3">
              {tripQuery.data && booking && (
                <BookingCosts
                  trip={tripQuery.data}
                  booking={booking}
                  travelers={travelersQuery.data ?? []}
                  editable={editable}
                />
              )}
              <BookingDisclosure title="Flight actions" hint="Check in, track or manage">
                <div className="flex flex-wrap gap-2">
                  {editable && booking && (
                    <button className="secondary-button" onClick={() => setAddingConnection(true)}>
                      <Plus className="size-4" /> Add connection
                    </button>
                  )}
                  <SafeExternalAction
                    className="secondary-button"
                    href={
                      actionUrl(airline?.tracker_url_template || airline?.status_url_template) ??
                      trackerUrl(flight.flight_number)
                    }
                  >
                    <Radar className="size-4" /> Public tracker
                  </SafeExternalAction>
                  {actionUrl(airline?.check_in_url_template) && (
                    <SafeExternalAction
                      className="secondary-button"
                      href={actionUrl(airline?.check_in_url_template)!}
                    >
                      Check in
                    </SafeExternalAction>
                  )}
                  {actionUrl(airline?.manage_booking_url_template) && (
                    <SafeExternalAction
                      className="secondary-button"
                      href={actionUrl(airline?.manage_booking_url_template)!}
                    >
                      Manage booking
                    </SafeExternalAction>
                  )}
                </div>
              </BookingDisclosure>
            </div>
            <p className="mt-3 flex items-center gap-2 text-xs text-muted">
              <UserRound className="size-4" /> Updated by a traveler ·{" "}
              {new Intl.DateTimeFormat(undefined, {
                dateStyle: "medium",
                timeStyle: "short"
              }).format(new Date(flight.status_updated_at))}
            </p>
          </>
        )}
        {editing && editable && flight && (
          <ModalSheet
            eyebrow={`${flight.airline_name} ${flight.flight_number}`}
            title="Manual flight update"
            onClose={() => {
              setEditMessage("");
              setEditing(false);
            }}
          >
            <form className="mt-3 space-y-5" onSubmit={submit}>
              <label className="form-label">
                Status
                <select
                  className="form-input capitalize"
                  name="status"
                  defaultValue={flight.status}
                >
                  {flightStatuses.map((status) => (
                    <option key={status} value={status}>
                      {status.replace("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {!showTimeZoneControls && tripQuery.data && (
                <fieldset className="rounded-2xl border border-line p-4">
                  <div className="mt-3">
                    <EventTimeZoneField
                      name="eventTimezone"
                      value={flight.departure_timezone}
                      localDefaultValue={furthestEventTimezone(
                        itineraryQuery.data ?? [],
                        tripQuery.data.primary_timezone
                      )}
                      label="Journey time zone"
                      hint="This applies to every connection while keeping each entered local clock time."
                    />
                  </div>
                </fieldset>
              )}
              <fieldset className="rounded-2xl border border-line p-4">
                <legend className="px-1 font-display text-lg font-black">Ticket schedule</legend>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <ZonedEditField
                    label="Scheduled departure"
                    name="scheduledDeparture"
                    value={toDateTimeLocal(
                      flight.scheduled_departure_at,
                      flight.departure_timezone
                    )}
                    timezone={flight.departure_timezone}
                    showTimeZoneControls={showTimeZoneControls}
                    required
                  />
                  <ZonedEditField
                    label="Scheduled arrival"
                    name="scheduledArrival"
                    value={toDateTimeLocal(flight.scheduled_arrival_at, flight.arrival_timezone)}
                    timezone={flight.arrival_timezone}
                    showTimeZoneControls={showTimeZoneControls}
                    required
                  />
                </div>
              </fieldset>
              <FormSection>
                <summary>Manual estimates</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <ZonedEditField
                    label="Estimated departure"
                    name="estimatedDeparture"
                    value={toDateTimeLocal(
                      flight.estimated_departure_at,
                      flight.departure_timezone
                    )}
                    timezone={flight.departure_timezone}
                    showTimeZoneControls={showTimeZoneControls}
                  />
                  <ZonedEditField
                    label="Estimated arrival"
                    name="estimatedArrival"
                    value={toDateTimeLocal(flight.estimated_arrival_at, flight.arrival_timezone)}
                    timezone={flight.arrival_timezone}
                    showTimeZoneControls={showTimeZoneControls}
                  />
                  <ZonedEditField
                    label="Actual departure"
                    name="actualDeparture"
                    value={toDateTimeLocal(flight.actual_departure_at, flight.departure_timezone)}
                    timezone={flight.departure_timezone}
                    showTimeZoneControls={showTimeZoneControls}
                  />
                  <ZonedEditField
                    label="Actual arrival"
                    name="actualArrival"
                    value={toDateTimeLocal(flight.actual_arrival_at, flight.arrival_timezone)}
                    timezone={flight.arrival_timezone}
                    showTimeZoneControls={showTimeZoneControls}
                  />
                </div>
              </FormSection>
              <FormSection>
                <summary>Boarding</summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <ZonedEditField
                    label="Exact boarding time"
                    name="boardingAt"
                    value={toDateTimeLocal(flight.boarding_at, flight.departure_timezone)}
                    timezone={flight.departure_timezone}
                    showTimeZoneControls={showTimeZoneControls}
                  />
                  <label className="form-label">
                    Boarding lead (minutes)
                    <input
                      className="form-input"
                      type="number"
                      min="0"
                      max="360"
                      name="boardingLeadMinutes"
                      defaultValue={flight.boarding_lead_minutes ?? ""}
                      placeholder="Enter minutes before scheduled departure"
                    />
                  </label>
                </div>
                <p className="mt-3 text-xs leading-5 text-muted">
                  When no exact time is entered, Trip Vault automatically subtracts the lead from
                  scheduled departure. An exact boarding time takes precedence.
                </p>
              </FormSection>
              <div className="grid grid-cols-2 gap-4">
                <label className="form-label">
                  Departure terminal
                  <input
                    className="form-input"
                    name="departureTerminal"
                    defaultValue={flight.departure_terminal ?? ""}
                  />
                </label>
                <label className="form-label">
                  Departure gate
                  <input
                    className="form-input"
                    name="departureGate"
                    defaultValue={flight.departure_gate ?? ""}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="form-label">
                  Arrival terminal
                  <input
                    className="form-input"
                    name="arrivalTerminal"
                    defaultValue={flight.arrival_terminal ?? ""}
                  />
                </label>
                <label className="form-label">
                  Arrival gate
                  <input
                    className="form-input"
                    name="arrivalGate"
                    defaultValue={flight.arrival_gate ?? ""}
                  />
                </label>
              </div>
              <label className="form-label">
                Baggage claim
                <input
                  className="form-input"
                  name="baggageClaim"
                  defaultValue={flight.baggage_claim ?? ""}
                />
              </label>
              <label className="form-label">
                Status note
                <textarea
                  className="form-input min-h-20"
                  name="statusNote"
                  defaultValue={flight.status_note ?? ""}
                />
              </label>
              {(editMessage || mutation.error) && (
                <p
                  role="alert"
                  className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger"
                >
                  {editMessage || getErrorMessage(mutation.error)}
                </p>
              )}
              <button className="primary-button w-full" disabled={mutation.isPending}>
                <Save className="size-4" /> Save manual update
              </button>
            </form>
          </ModalSheet>
        )}
        {uploading && flight && tripQuery.data && (
          <UploadDocumentForm
            trip={tripQuery.data}
            travelers={bookingTravelers}
            preferredTravelerId={focusedTravelerId ?? undefined}
            members={membersQuery.data ?? []}
            bookingId={flight.booking_id}
            flightLegId={flight.id}
            contextTitle={`${flight.departure_airport_code || flight.departure_airport_name} to ${flight.arrival_airport_code || flight.arrival_airport_name}`}
            privateOnly={!editable}
            onClose={() => setUploading(false)}
          />
        )}
        {addingConnection && flight && booking && tripQuery.data && (
          <AddFlightConnectionForm
            trip={tripQuery.data}
            booking={booking}
            lastLeg={(connectionsQuery.data ?? [flight]).at(-1) ?? flight}
            onClose={() => setAddingConnection(false)}
          />
        )}
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
  detail,
  onEdit
}: {
  label: string;
  value: string;
  detail: string;
  onEdit?: () => void;
}) {
  const content = (
    <>
      <span className="eyebrow block">{label}</span>
      <span className="mt-1 block font-display text-base font-black">{value}</span>
      <span className="mt-1 block break-words text-xs text-muted">{detail}</span>
    </>
  );
  if (!onEdit) return <div className="bg-surface p-3">{content}</div>;
  return (
    <button
      type="button"
      onClick={onEdit}
      className="group w-full bg-surface p-3 text-left hover:bg-elevated focus-visible:ring-2 focus-visible:ring-brand"
    >
      {content}
      <span className="sr-only">Edit details</span>
    </button>
  );
}
function ZonedEditField({
  label,
  name,
  value,
  timezone,
  showTimeZoneControls,
  required = false
}: {
  label: string;
  name: string;
  value: string;
  timezone: string;
  showTimeZoneControls: boolean;
  required?: boolean;
}) {
  return (
    <div>
      <label className="form-label">
        {label}
        <input
          className="form-input"
          type="datetime-local"
          name={name}
          defaultValue={value}
          required={required}
        />
      </label>
      {showTimeZoneControls ? (
        <>
          <label className="mt-2 block text-xs font-bold text-muted">
            {timezone} · if this clock time occurs twice
            <select className="form-input mt-1" name={`${name}Occurrence`} defaultValue="automatic">
              <option value="automatic">Automatic (usual)</option>
              <option value="earlier">Earlier occurrence</option>
              <option value="later">Later occurrence</option>
            </select>
          </label>
          <p className="mt-1 text-[.68rem] leading-5 text-muted">
            Only change this when daylight saving makes the same local time happen twice and the
            ticket identifies which one.
          </p>
        </>
      ) : (
        <input type="hidden" name={`${name}Occurrence`} value="earlier" />
      )}
    </div>
  );
}
