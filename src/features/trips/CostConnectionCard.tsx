import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { DocumentTypeIcon } from "../../components/DocumentTypeIcon";
import { eventIconTone } from "../../components/EventTypeIcon";
import { EventSilhouette } from "../../components/EventSilhouette";
import { TripChildLink } from "../../components/TripChildLink";
import { getVaultDocument } from "../workspace/api";
import { bookingEventType } from "../workspace/bookingPresentation";
import type { Booking, FlightLeg } from "../workspace/types";
import { eventTimeLabel } from "../timeline/model";
import { formatDate, formatEventTime, formatItineraryDate } from "./presentation";
import type { ItineraryItem } from "./types";

export function CostEventCard({
  tripId,
  booking,
  event,
  flights = [],
  onOpen,
  onSelect
}: {
  tripId: string;
  booking?: Booking;
  event?: ItineraryItem;
  flights?: FlightLeg[];
  onOpen: () => void;
  onSelect?: () => void;
}) {
  const flightLegs = flights
    .filter((leg) => leg.booking_id === booking?.id)
    .sort((a, b) => a.segment_order - b.segment_order);
  const firstFlight = flightLegs[0];
  const title = event?.title ?? booking?.title ?? "Event";
  const dateOnly =
    event &&
    (event.timing_mode === "date_only" || event.timing_mode === "all_day" || event.is_all_day);
  const date = event
    ? dateOnly
      ? event.scheduled_date
        ? formatDate(event.scheduled_date)
        : formatItineraryDate(event.starts_at, event.timezone)
      : (eventTimeLabel(event) ?? formatEventTime(event.starts_at, event.timezone))
    : booking?.start_at
      ? formatEventTime(booking.start_at, booking.source_timezone ?? "UTC")
      : "No date yet";
  const type = event?.event_type ?? (booking ? bookingEventType(booking.type) : "custom");
  const href = booking
    ? firstFlight
      ? `/trips/${tripId}/flights/${firstFlight.id}`
      : `/trips/${tripId}/bookings/${booking.id}`
    : `/trips/${tripId}?view=timeline&event=${encodeURIComponent(event!.id)}`;
  const content = (
    <div
      className={`event-scene event-type-icon--${eventIconTone(type)} flex min-h-16 items-center gap-3 rounded-xl border border-line px-3 py-2.5 [&>.event-silhouette]:right-8`}
    >
      <EventSilhouette type={type} placement="summary" />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm font-bold">{title}</p>
        <p className="mt-1 text-xs font-normal text-muted">{date}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
    </div>
  );
  const className =
    "block w-full rounded-xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand";
  return onSelect ? (
    <button
      type="button"
      className={className}
      aria-label={`View event details: ${title}`}
      onClick={onSelect}
    >
      {content}
    </button>
  ) : (
    <TripChildLink
      tripId={tripId}
      to={href}
      onClick={onOpen}
      className={className}
      aria-label={`View event details: ${title}`}
    >
      {content}
    </TripChildLink>
  );
}

export function CostDocumentCard({
  tripId,
  documentId,
  onOpen
}: {
  tripId: string;
  documentId: string;
  onOpen: () => void;
}) {
  const query = useQuery({
    queryKey: ["document", documentId, "cost-connection"],
    queryFn: () => getVaultDocument(documentId, { allowCachedOnError: false })
  });
  // Never disclose a cached title when access has been revoked or the document archived.
  if (query.isError || query.data?.deleted_at || (query.data && query.data.trip_id !== tripId))
    return (
      <p className="text-sm text-muted">Linked document is unavailable or not shared with you.</p>
    );
  if (!query.data) return <p className="text-sm text-muted">Loading document…</p>;
  return (
    <TripChildLink
      tripId={tripId}
      to={`/trips/${tripId}/documents/${documentId}`}
      onClick={onOpen}
      className="flex min-h-16 items-center gap-3 rounded-xl border border-line bg-elevated p-3 text-sm font-bold"
    >
      <DocumentTypeIcon type={query.data.category} emphasis="strong" />
      <span className="min-w-0 flex-1">{query.data.title}</span>
      <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
    </TripChildLink>
  );
}
