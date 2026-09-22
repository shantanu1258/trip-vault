import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clipboard, Clock3, LocateFixed, Pencil, Phone, Trash2 } from "lucide-react";
import { DocumentTypeIcon } from "../components/DocumentTypeIcon";
import { Fragment, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { ModalSheet } from "../components/ModalSheet";
import { TripBackLink } from "../components/TripBackLink";
import {
  BookingDisclosure,
  BookingDocuments,
  primaryBookingDocument
} from "../features/workspace/BookingDetailSections";
import { JourneyEssentials, stayDuration } from "../features/workspace/JourneyEssentials";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { arrivalDayOffset, journeyDuration, phoneActionUrls } from "../features/timeline/model";
import { formatEventTime } from "../features/trips/presentation";
import { localProfileId } from "../features/sync/localSync";
import {
  archiveBooking,
  getBooking,
  googleMapsDirectionsUrl,
  listBookingTravelerIds,
  listJourneyLegsForBooking
} from "../features/workspace/api";
import { EditBookingForm, UploadDocumentForm } from "../features/workspace/WorkspaceForms";
import { documentMatchesTraveler } from "../features/workspace/documentModel";
import { JourneyTravelerDetails } from "../features/workspace/JourneyTravelerDetails";
import { EditJourneyLegForm } from "../features/workspace/EditJourneyLegForm";
import { readTravelerFocus } from "../features/workspace/travelerFocus";
import { tripChildNavigationState, tripReturnNavigation } from "../features/trips/navigation";
import { useConfirmDialog } from "../components/ConfirmDialogProvider";
import { WhatsAppIcon } from "../components/WhatsAppIcon";
import { tripQueries } from "../features/queries/tripQueries";
import { BookingCosts } from "../features/workspace/BookingCosts";
import { CabStopsManager } from "../features/workspace/CabStopsManager";
import {
  bookingAppearance,
  bookingCountdown,
  bookingEventType
} from "../features/workspace/bookingPresentation";
import { BookingHeroSurface } from "../components/BookingHeroSurface";

export function BookingPage() {
  const confirm = useConfirmDialog();
  const { tripId = "", bookingId = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentLocation = useLocation();
  const locationState = currentLocation.state;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [choosingUploadConnection, setChoosingUploadConnection] = useState(false);
  const [editingLeg, setEditingLeg] = useState<
    import("../features/workspace/types").JourneyLeg | null
  >(null);
  const [uploadTarget, setUploadTarget] = useState<{
    journeyLegId?: string;
    contextTitle?: string;
  } | null>(null);
  const [userId, setUserId] = useState("");
  useEffect(() => {
    void localProfileId().then((id) => setUserId(id ?? ""));
  }, []);
  const query = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => getBooking(bookingId),
    enabled: Boolean(bookingId)
  });
  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ ...tripQueries.members(tripId), enabled: Boolean(tripId) });
  const travelerIdsQuery = useQuery({
    queryKey: ["booking-traveler-ids", bookingId],
    queryFn: () => listBookingTravelerIds(bookingId, tripId),
    enabled: Boolean(bookingId && tripId)
  });
  const documentsQuery = useQuery({ ...tripQueries.documents(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ ...tripQueries.itinerary(tripId), enabled: Boolean(tripId) });
  const legsQuery = useQuery({
    queryKey: ["journey-legs", tripId, bookingId],
    queryFn: () => listJourneyLegsForBooking(bookingId, tripId),
    enabled: Boolean(bookingId && tripId)
  });
  const booking = query.data;
  const costsQuery = useQuery({
    ...tripQueries.costs(tripId),
    enabled: Boolean(tripId && booking?.type === "cab")
  });
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role;
  const editable = role === "owner" || role === "editor";
  const bookingTimezone = booking?.source_timezone ?? tripQuery.data?.primary_timezone ?? "UTC";
  const returnNavigation = tripReturnNavigation(locationState, tripId);
  const nestedNavigationState = tripChildNavigationState(
    locationState,
    tripId,
    returnNavigation.view,
    `${currentLocation.pathname}${currentLocation.search}`
  );
  const archive = useMutation({
    mutationFn: () => archiveBooking(booking!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["bookings", tripId] });
      navigate(returnNavigation.href, { replace: true, state: returnNavigation.state });
    }
  });
  const location = booking?.location?.address || booking?.location?.label;
  const hasNavigationLocation = Boolean(
    booking?.location?.map_url ||
    location ||
    (typeof booking?.location?.latitude === "number" &&
      typeof booking?.location?.longitude === "number")
  );
  const focusedTravelerId = readTravelerFocus(tripId);
  const documents = (documentsQuery.data ?? []).filter(
    (document) =>
      document.booking_id === bookingId &&
      (!focusedTravelerId || documentMatchesTraveler(document, focusedTravelerId))
  );
  const phone = booking?.contact_phone ? phoneActionUrls(booking.contact_phone) : null;
  const primaryDocument = primaryBookingDocument(documents);
  const documentActionLabel =
    primaryDocument?.purpose === "confirmation" || primaryDocument?.purpose === "hotel_confirmation"
      ? "Open confirmation"
      : "Open ticket";
  const journeyLegs = legsQuery.data ?? [];
  useEffect(() => {
    if (searchParams.get("editJourney") !== "true" || !editable || !journeyLegs[0]) return;
    const next = new URLSearchParams(searchParams);
    next.delete("editJourney");
    setSearchParams(next, { replace: true, state: locationState });
    setEditingLeg(journeyLegs[0]);
  }, [editable, journeyLegs, locationState, searchParams, setSearchParams]);
  const bookingItineraryItem = itineraryQuery.data?.find((item) => item.booking_id === bookingId);
  const lastLeg = journeyLegs.at(-1);
  const bookingTravelerIds = travelerIdsQuery.data ?? [];
  const allTravelers = travelersQuery.data ?? [];
  const bookingTravelers =
    booking?.participant_scope === "selected"
      ? allTravelers.filter((traveler) => bookingTravelerIds.includes(traveler.id))
      : booking?.participant_scope === "everyone"
        ? allTravelers
        : bookingTravelerIds.length
          ? allTravelers.filter((traveler) => bookingTravelerIds.includes(traveler.id))
          : allTravelers;
  const visibleBookingTravelers = focusedTravelerId
    ? bookingTravelers.filter((traveler) => traveler.id === focusedTravelerId)
    : bookingTravelers;
  const bookingEndTimezone = lastLeg?.destination_timezone ?? bookingTimezone;
  const appearance = bookingAppearance[booking?.type ?? "other"];
  const BookingIcon = appearance.icon;
  const compactHeroActions =
    Number(documents.length > 0) + Number(hasNavigationLocation) + (phone ? 2 : 0) > 2;
  const heroActionClass = `hero-action hero-shortcut${compactHeroActions ? "" : " hero-shortcut--label"}`;
  const heroLabelClass = compactHeroActions ? "hidden md:inline" : "inline";
  const countdown =
    booking &&
    bookingItineraryItem?.has_explicit_start_time !== false &&
    !bookingItineraryItem?.is_all_day &&
    !["date_only", "unscheduled"].includes(bookingItineraryItem?.timing_mode ?? "")
      ? bookingCountdown(booking, journeyLegs[0]?.scheduled_departure_at ?? booking.start_at)
      : null;
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between gap-3">
          <TripBackLink {...returnNavigation} />
          {booking && editable && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="tap-target inline-flex shrink-0 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand hover:bg-brand-soft"
            >
              <Pencil aria-hidden="true" className="size-4" />
              Edit {booking.type === "restaurant" ? "meal" : appearance.label.toLowerCase()}
            </button>
          )}
        </div>
        {query.isLoading && <LoadingCard label="Loading booking" />}
        {query.error && <ErrorCard error={query.error} />}
        {booking && (
          <section className="page-enter mt-3 min-w-0 space-y-3">
            <BookingHeroSurface key={booking.id} type={bookingEventType(booking.type)}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[.14em]">
                  {booking.reservation_state?.replaceAll("_", " ") || appearance.label}
                </span>
                <BookingIcon className="size-6 shrink-0" aria-hidden="true" />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold capitalize text-white/85">
                    {appearance.label}
                    {booking.journey_scope ? ` · ${booking.journey_scope}` : ""}
                  </p>
                  <h1 className="mt-2 break-words font-display text-2xl font-black tracking-[-.025em]">
                    {booking.title}
                  </h1>
                  {booking.provider && booking.provider !== booking.title && (
                    <p className="mt-1 text-sm text-white/85">{booking.provider}</p>
                  )}
                </div>
              </div>
              {countdown && (
                <p className="mt-3 flex items-center gap-2 text-sm font-bold">
                  <Clock3 className="size-5 shrink-0" aria-hidden="true" />
                  {countdown}
                </p>
              )}
              {(documents.length > 0 || phone || hasNavigationLocation) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {primaryDocument && (
                    <Link
                      className="hero-action hero-shortcut"
                      to={`/trips/${tripId}/documents/${primaryDocument.id}`}
                      state={nestedNavigationState}
                      aria-label={documentActionLabel}
                      title={documentActionLabel}
                    >
                      <DocumentTypeIcon
                        type={primaryDocument.category}
                        size="sm"
                        variant="monochrome"
                      />
                      <span className="hidden md:inline">{documentActionLabel}</span>
                    </Link>
                  )}
                  {!primaryDocument && documents.length > 0 && (
                    <a
                      className="hero-action hero-shortcut"
                      href="#booking-documents"
                      aria-label="View documents"
                      title="View documents"
                    >
                      <DocumentTypeIcon
                        type={
                          documents.every((doc) => doc.category === documents[0].category)
                            ? documents[0].category
                            : "other"
                        }
                        size="sm"
                        variant="monochrome"
                      />
                      <span className="hidden md:inline">View documents</span>
                    </a>
                  )}
                  {hasNavigationLocation && (
                    <a
                      className={heroActionClass}
                      href={booking.location?.map_url || googleMapsDirectionsUrl(booking.location!)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Navigate to booking location"
                      title="Navigate to booking location"
                    >
                      <LocateFixed className="size-4" aria-hidden="true" />
                      <span className={heroLabelClass}>Navigate</span>
                    </a>
                  )}
                  {phone && (
                    <>
                      <a
                        className={heroActionClass}
                        href={phone.call}
                        aria-label="Call provider"
                        title="Call provider"
                      >
                        <Phone className="size-4" aria-hidden="true" />
                        <span className={heroLabelClass}>Call</span>
                      </a>
                      <a
                        className={heroActionClass}
                        href={phone.whatsapp}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="WhatsApp provider"
                        title="WhatsApp provider"
                      >
                        <WhatsAppIcon />
                        <span className={heroLabelClass}>WhatsApp</span>
                      </a>
                    </>
                  )}
                </div>
              )}
            </BookingHeroSurface>
            {!journeyLegs.length && (booking.start_at || booking.end_at) && (
              <section
                aria-label="Booking essentials"
                className="overflow-hidden rounded-xl border border-line bg-surface"
              >
                <div className="grid grid-cols-2 gap-px bg-line [&>*:last-child:nth-child(odd)]:col-span-2">
                  {booking.start_at && (
                    <Detail
                      label={appearance.start}
                      value={formatEventTime(booking.start_at, bookingTimezone)}
                      detail={bookingTimezone}
                      onEdit={editable ? () => setEditing(true) : undefined}
                    />
                  )}
                  {booking.end_at && (
                    <Detail
                      label={appearance.end}
                      value={formatEventTime(booking.end_at, bookingEndTimezone)}
                      detail={bookingEndTimezone}
                      onEdit={editable ? () => setEditing(true) : undefined}
                    />
                  )}
                  {booking.start_at && booking.end_at && (
                    <Detail
                      label={booking.type === "hotel" ? "Stay" : "Duration"}
                      value={
                        booking.type === "hotel"
                          ? stayDuration(booking.start_at, booking.end_at, bookingTimezone)
                          : journeyDuration(booking.start_at, booking.end_at)
                      }
                      onEdit={editable ? () => setEditing(true) : undefined}
                    />
                  )}
                  {booking.type === "hotel" && typeof booking.details.room_count === "number" && (
                    <Detail
                      label="Rooms"
                      value={String(booking.details.room_count)}
                      detail={
                        typeof booking.details.room_type === "string"
                          ? booking.details.room_type
                          : undefined
                      }
                      onEdit={editable ? () => setEditing(true) : undefined}
                    />
                  )}
                </div>
              </section>
            )}
            {(legsQuery.data?.length ?? 0) > 0 && (
              <section>
                <div className="space-y-2">
                  {legsQuery.data?.map((leg, index) => {
                    const day = leg.scheduled_arrival_at
                      ? arrivalDayOffset(
                          leg.scheduled_departure_at,
                          leg.origin_timezone,
                          leg.scheduled_arrival_at,
                          leg.destination_timezone
                        )
                      : null;
                    const routeTitle = `${leg.origin_code || leg.origin_name} to ${leg.destination_code || leg.destination_name}`;
                    return (
                      <Fragment key={leg.id}>
                        <article
                          aria-label={`Journey ${index + 1}: ${routeTitle}`}
                          className={`group relative overflow-hidden rounded-xl border border-line bg-surface ${editable ? "transition hover:border-brand/40 hover:shadow-soft" : ""}`}
                          key={leg.id}
                        >
                          {editable && (
                            <CardEditTarget
                              label={`Edit journey connection ${index + 1}`}
                              onEdit={() => setEditingLeg(leg)}
                            />
                          )}
                          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2 text-sm">
                            <strong>
                              {journeyLegs.length > 1 ? `Connection ${index + 1}` : "Journey"}
                              {leg.service_number ? ` · ${leg.service_number}` : ""}
                            </strong>
                            <span className="text-xs capitalize text-muted">{leg.mode}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-px bg-line">
                            <Detail
                              label={bookingAppearance[leg.mode].start}
                              value={formatEventTime(
                                leg.scheduled_departure_at,
                                leg.origin_timezone
                              )}
                              detail={`${leg.origin_name}${booking.journey_scope === "international" ? ` · ${leg.origin_timezone}` : ""}`}
                            />
                            <Detail
                              label={bookingAppearance[leg.mode].end}
                              value={
                                leg.scheduled_arrival_at
                                  ? `${formatEventTime(leg.scheduled_arrival_at, leg.destination_timezone)}${day ? ` · ${day > 0 ? "+" : ""}${day} day` : ""}`
                                  : "Arrival not added"
                              }
                              detail={[
                                leg.destination_name,
                                booking.journey_scope === "international"
                                  ? leg.destination_timezone
                                  : null,
                                leg.scheduled_arrival_at
                                  ? journeyDuration(
                                      leg.scheduled_departure_at,
                                      leg.scheduled_arrival_at
                                    )
                                  : "Duration not available"
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            />
                          </div>
                          <JourneyEssentials leg={leg} layout="grid" />
                        </article>
                        {leg.mode === "cab" && tripQuery.data && (
                          <CabStopsManager
                            tripId={tripId}
                            leg={leg}
                            costs={costsQuery.data ?? []}
                            currencyCode={tripQuery.data.base_currency}
                            eventTimezone={leg.origin_timezone}
                            participantTravelerIds={bookingTravelers.map((traveler) => traveler.id)}
                            editable={editable}
                          />
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              </section>
            )}

            {booking.reference_code && (
              <section
                aria-label="Booking reference details"
                className="rounded-xl border border-line bg-surface"
              >
                <Detail
                  label={
                    booking.type === "hotel" || booking.type === "restaurant"
                      ? "Confirmation reference"
                      : ["activity", "other", "ferry"].includes(booking.type)
                        ? "Booking reference"
                        : "Booking reference / PNR"
                  }
                  value={booking.reference_code}
                  detail={[
                    booking.journey_scope,
                    booking.booked_via_name ? `Booked via ${booking.booked_via_name}` : null
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  copy
                  onEdit={editable ? () => setEditing(true) : undefined}
                />
              </section>
            )}

            {location && (
              <a
                className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface p-3 text-brand transition hover:bg-elevated focus-visible:ring-2 focus-visible:ring-brand"
                href={googleMapsDirectionsUrl(booking.location ?? location)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Navigate to ${location}`}
              >
                <LocateFixed className="size-5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold uppercase tracking-wider text-muted">
                    Location
                  </span>
                  <strong className="mt-1 block break-words text-sm">{location}</strong>
                </span>
                <span className="text-xs font-bold">Navigate</span>
              </a>
            )}

            <BookingDocuments
              documents={documents}
              travelers={allTravelers}
              focusedTravelerId={focusedTravelerId}
              navigationState={nestedNavigationState}
              onUpload={() => {
                if (journeyLegs.length > 1) setChoosingUploadConnection(true);
                else
                  setUploadTarget({
                    journeyLegId: journeyLegs[0]?.id,
                    contextTitle: journeyLegs[0]
                      ? `${journeyLegs[0].origin_name} → ${journeyLegs[0].destination_name}`
                      : booking.title
                  });
              }}
            />
            <JourneyTravelerDetails
              tripId={tripId}
              legs={journeyLegs}
              travelers={visibleBookingTravelers}
              canEdit={editable}
            />
            {booking.type === "hotel" && (
              <BookingDisclosure
                title="Room & guest details"
                hint={
                  [
                    typeof booking.details.room_type === "string"
                      ? booking.details.room_type
                      : null,
                    typeof booking.details.room_count === "number"
                      ? `${booking.details.room_count} ${booking.details.room_count === 1 ? "room" : "rooms"}`
                      : null
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Not added yet"
                }
              >
                <dl className="space-y-3 text-sm">
                  {[
                    ["Room type", booking.details.room_type],
                    ["Number of rooms", booking.details.room_count],
                    ["Lead guest", booking.details.lead_guest]
                  ].map(([label, value]) =>
                    (typeof value === "string" || typeof value === "number") && value !== "" ? (
                      <div key={String(label)}>
                        <dt className="text-xs text-muted">{String(label)}</dt>
                        <dd className="mt-1 break-words font-bold">{value}</dd>
                      </div>
                    ) : null
                  )}
                </dl>
                {editable && (
                  <button
                    type="button"
                    className="secondary-button mt-3 text-xs"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="size-4" /> Edit stay details
                  </button>
                )}
              </BookingDisclosure>
            )}
            {tripQuery.data && (
              <BookingCosts
                trip={tripQuery.data}
                booking={booking}
                travelers={allTravelers}
                editable={editable}
              />
            )}
            {(booking.booked_via_name ||
              booking.booked_via_url ||
              booking.contact_phone ||
              location) && (
              <BookingDisclosure
                title="Booking & contact"
                hint={[booking.booked_via_name, booking.contact_name].filter(Boolean).join(" · ")}
              >
                <div className="space-y-2">
                  {location && (
                    <button
                      type="button"
                      className="secondary-button text-xs"
                      onClick={() => navigator.clipboard.writeText(location)}
                    >
                      <Clipboard className="size-4" /> Copy address
                    </button>
                  )}
                  {(booking.booked_via_name || booking.booked_via_url) && (
                    <div
                      className={`group relative rounded-lg bg-elevated p-3 ${editable ? "transition hover:shadow-soft" : ""}`}
                    >
                      {editable && (
                        <CardEditTarget
                          label="Edit booking source"
                          onEdit={() => setEditing(true)}
                        />
                      )}
                      <p className="eyebrow">Booked via</p>
                      {booking.booked_via_url ? (
                        <a
                          className="relative z-20 mt-2 inline-flex font-bold text-brand"
                          href={booking.booked_via_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {booking.booked_via_name || "Open booking website"} →
                        </a>
                      ) : (
                        <p className="mt-2 font-bold">{booking.booked_via_name}</p>
                      )}
                    </div>
                  )}
                  {booking.contact_phone && (
                    <div
                      className={`group relative rounded-lg bg-elevated p-3 ${editable ? "transition hover:shadow-soft" : ""}`}
                    >
                      {editable && (
                        <CardEditTarget
                          label="Edit booking contact"
                          onEdit={() => setEditing(true)}
                        />
                      )}
                      <p className="eyebrow">Booking contact</p>
                      <p className="mt-2 font-bold">
                        {booking.contact_name || booking.contact_phone}
                      </p>
                      {booking.contact_name && (
                        <p className="mt-1 text-sm text-muted">{booking.contact_phone}</p>
                      )}
                      {phone && (
                        <div className="relative z-20 mt-3 flex flex-wrap gap-2">
                          <a className="secondary-button" href={phone.call}>
                            <Phone className="size-4" /> Call
                          </a>
                          <a
                            className="secondary-button"
                            href={phone.whatsapp}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <WhatsAppIcon /> WhatsApp
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </BookingDisclosure>
            )}
            {typeof booking.details.notes === "string" && booking.details.notes.trim() && (
              <BookingDisclosure title="Notes" open={booking.details.notes.length <= 160}>
                {typeof booking.details.notes === "string" && (
                  <div
                    className={`group relative whitespace-pre-wrap rounded-lg bg-elevated p-3 text-sm leading-6 text-muted ${editable ? "transition hover:shadow-soft" : ""}`}
                  >
                    {editable && (
                      <CardEditTarget label="Edit booking notes" onEdit={() => setEditing(true)} />
                    )}
                    {booking.details.notes}
                  </div>
                )}
              </BookingDisclosure>
            )}
            {editable && (
              <div className="flex justify-end">
                <button
                  type="button"
                  aria-label="Archive booking"
                  title="Archive booking"
                  disabled={archive.isPending}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Archive booking?",
                        message: `Move ${booking.title} to the archive?`,
                        confirmLabel: "Archive",
                        tone: "danger"
                      })
                    )
                      archive.mutate();
                  }}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-danger hover:bg-elevated disabled:opacity-50"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  <span>Archive booking</span>
                </button>
              </div>
            )}
          </section>
        )}
        {editing && booking && tripQuery.data && (
          <EditBookingForm
            trip={tripQuery.data}
            booking={booking}
            travelers={travelersQuery.data ?? []}
            selectedTravelerIds={travelerIdsQuery.data ?? []}
            onClose={() => setEditing(false)}
          />
        )}
        {editingLeg && booking && tripQuery.data && (
          <EditJourneyLegForm
            trip={tripQuery.data}
            booking={booking}
            leg={editingLeg}
            legNumber={editingLeg.segment_order + 1}
            legCount={journeyLegs.length}
            itinerary={itineraryQuery.data ?? []}
            itineraryItem={bookingItineraryItem}
            onClose={() => setEditingLeg(null)}
          />
        )}
        {choosingUploadConnection && booking && (
          <ModalSheet
            title="Upload document"
            eyebrow={booking.title}
            onClose={() => setChoosingUploadConnection(false)}
          >
            <p className="mt-4 text-sm text-muted">
              Does this document cover the whole booking or one connection?
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                className="secondary-button justify-start"
                onClick={() => {
                  setChoosingUploadConnection(false);
                  setUploadTarget({ contextTitle: booking.title });
                }}
              >
                Whole booking
              </button>
              {journeyLegs.map((leg, index) => (
                <button
                  key={leg.id}
                  type="button"
                  className="secondary-button justify-start text-left"
                  onClick={() => {
                    setChoosingUploadConnection(false);
                    setUploadTarget({
                      journeyLegId: leg.id,
                      contextTitle: `${leg.origin_name} → ${leg.destination_name}`
                    });
                  }}
                >
                  Connection {index + 1}: {leg.origin_name} → {leg.destination_name}
                </button>
              ))}
            </div>
          </ModalSheet>
        )}
        {uploadTarget && tripQuery.data && (
          <UploadDocumentForm
            trip={tripQuery.data}
            travelers={travelersQuery.data ?? []}
            preferredTravelerId={focusedTravelerId ?? undefined}
            members={membersQuery.data ?? []}
            bookingId={bookingId}
            journeyLegId={uploadTarget.journeyLegId}
            contextTitle={uploadTarget.contextTitle ?? booking?.title}
            privateOnly={!editable}
            onClose={() => setUploadTarget(null)}
          />
        )}
      </div>
    </AppShell>
  );
}

function CardEditTarget({ label, onEdit }: { label: string; onEdit: () => void }) {
  return (
    <button
      type="button"
      className="absolute inset-0 z-10 cursor-pointer rounded-[inherit] focus-visible:ring-2 focus-visible:ring-brand"
      onClick={onEdit}
      aria-label={label}
    />
  );
}

function Detail({
  label,
  value,
  detail,
  copy = false,
  onEdit
}: {
  label: string;
  value: string;
  detail?: string;
  copy?: boolean;
  onEdit?: () => void;
}) {
  return (
    <div
      className={`group relative flex items-start gap-3 bg-surface p-3 ${onEdit ? "transition hover:shadow-soft" : ""}`}
    >
      {onEdit && <CardEditTarget label={`Edit ${label}`} onEdit={onEdit} />}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[.1em] text-muted">{label}</p>
        <p className="mt-1 break-words font-display text-base font-black">{value}</p>
        {detail && <p className="mt-1 break-words text-xs text-muted">{detail}</p>}
      </div>
      {copy && (
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(value)}
          className="tap-target relative z-20 grid size-10 place-items-center rounded-xl border border-line"
          aria-label={`Copy ${label}`}
        >
          <Clipboard className="size-4" />
        </button>
      )}
    </div>
  );
}
