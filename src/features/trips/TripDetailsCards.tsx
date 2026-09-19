import { CalendarDays, ChevronRight, FileText, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { phoneActionUrls } from "../timeline/model";
import type { Booking, FlightLeg, TripNote } from "../workspace/types";
import { WhatsAppIcon } from "../../components/WhatsAppIcon";

export function indexFirstFlightByBooking(flights: FlightLeg[]) {
  const result = new Map<string, FlightLeg>();
  for (const flight of flights
    .slice()
    .sort((left, right) => left.segment_order - right.segment_order)) {
    if (!result.has(flight.booking_id)) result.set(flight.booking_id, flight);
  }
  return result;
}

export function ReservationCard({
  booking,
  href,
  route,
  navigationState
}: {
  booking: Booking;
  href: string;
  route?: string;
  navigationState?: unknown;
}) {
  const phone = booking.contact_phone ? phoneActionUrls(booking.contact_phone) : null;

  return (
    <article className="group relative rounded-2xl border border-line bg-elevated p-4 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft">
      <Link
        to={href}
        state={navigationState}
        className="absolute inset-0 z-10 rounded-2xl focus-visible:ring-2 focus-visible:ring-brand"
        aria-label={`Open details for ${booking.title}`}
      />
      <div className="pr-6">
        <p className="text-xs font-bold uppercase tracking-[.12em] text-muted">
          {booking.type}
          {booking.journey_scope ? ` · ${booking.journey_scope}` : ""}
        </p>
        <p className="mt-2 font-display text-lg font-black text-brand">{booking.title}</p>
        {route && <p className="mt-1 text-sm font-black text-ink">{route}</p>}
        <p className="mt-1 text-xs text-muted">
          {booking.provider}
          {booking.reference_code ? ` · ${booking.reference_code}` : ""}
          {booking.booked_via_name ? ` · via ${booking.booked_via_name}` : ""}
        </p>
      </div>
      {phone && (
        <div className="relative z-20 mt-3 flex gap-3 pr-6">
          <a className="text-xs font-extrabold text-brand" href={phone.call}>
            Call
          </a>
          <a
            className="inline-flex items-center gap-1 text-xs font-extrabold text-success"
            href={phone.whatsapp}
            target="_blank"
            rel="noreferrer"
          >
            <WhatsAppIcon className="size-3.5" /> WhatsApp
          </a>
        </div>
      )}
      <ChevronRight
        aria-hidden="true"
        className="absolute bottom-4 right-4 size-4 text-muted transition-transform group-hover:translate-x-0.5"
      />
    </article>
  );
}

function reservationDate(booking: Booking) {
  if (!booking.start_at) return "Date not added";
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: booking.source_timezone || undefined
  }).format(new Date(booking.start_at));
}

export function ReservationRow({
  booking,
  href,
  onClick,
  route,
  documentCount = 0,
  navigationState
}: {
  booking: Booking;
  href?: string;
  onClick?: () => void;
  route?: string;
  documentCount?: number;
  navigationState?: unknown;
}) {
  const className =
    "group grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl border border-line bg-elevated p-3 text-left transition hover:border-brand/40 hover:shadow-soft";
  const content = (
    <>
      <span className="min-w-0">
        <span className="block text-[.65rem] font-black uppercase tracking-[.13em] text-muted">
          {booking.type.replaceAll("_", " ")}
          {booking.journey_scope ? ` · ${booking.journey_scope}` : ""}
        </span>
        <strong className="mt-1.5 block whitespace-normal break-words font-display text-base leading-5 text-brand [overflow-wrap:anywhere]">
          {route || booking.title}
        </strong>
        {route && booking.title !== route && (
          <span className="mt-1 block whitespace-normal break-words text-xs font-bold text-ink [overflow-wrap:anywhere]">
            {booking.title}
          </span>
        )}
        <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" /> {reservationDate(booking)}
          </span>
          {booking.provider && <span>{booking.provider}</span>}
          {documentCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3.5" /> {documentCount} document
              {documentCount === 1 ? "" : "s"}
            </span>
          )}
        </span>
      </span>
      <ChevronRight className="mt-6 size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </>
  );

  if (href) {
    return (
      <Link to={href} state={navigationState} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={onClick}>
      {content}
    </button>
  );
}

export function NoteCard({
  note,
  editable,
  onEdit,
  onArchive
}: {
  note: TripNote;
  editable: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  return (
    <article
      className={`group relative min-h-14 rounded-xl bg-elevated px-3 py-2 ${
        editable ? "transition hover:-translate-y-0.5 hover:shadow-soft" : ""
      }`}
    >
      {editable && (
        <button
          type="button"
          className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-brand"
          onClick={onEdit}
          aria-label={`Edit ${note.title || "note"}`}
        />
      )}
      <div className={editable ? "pr-10" : ""}>
        <p className="break-words text-sm font-bold leading-5 [overflow-wrap:anywhere]">
          {note.title || "Note"}
        </p>
        {note.body && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-muted [overflow-wrap:anywhere]">
            {note.body}
          </p>
        )}
      </div>
      {editable && (
        <button
          type="button"
          className="absolute right-1 top-1 z-20 grid size-11 place-items-center rounded-lg text-danger"
          onClick={onArchive}
          aria-label={`Archive ${note.title || "note"}`}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </article>
  );
}
