import type { CSSProperties, ReactNode } from "react";
import type { TimelineEventType } from "../features/trips/types";
import type { Booking } from "../features/workspace/types";
import { bookingEventType } from "../features/workspace/bookingPresentation";
import { eventIconTone } from "./EventTypeIcon";
import { EventSilhouette } from "./EventSilhouette";

/** Reservation summary styling for expanded timeline cards. */
export function BookingSummarySurface({
  booking,
  eventType,
  route,
  accentStyle,
  children
}: {
  booking: Booking;
  eventType?: TimelineEventType;
  route?: string;
  accentStyle?: CSSProperties;
  children?: ReactNode;
}) {
  const status = booking.type === "flight" ? "booked" : booking.reservation_state;
  const visualType = eventType ?? bookingEventType(booking.type);
  return (
    <div
      style={accentStyle}
      className={`event-scene event-type-icon--${eventIconTone(visualType)} rounded-xl border border-line/80 px-3 py-2.5 text-xs ${booking.type === "flight" || accentStyle ? "airline-accent-rail pl-4" : ""}`}
    >
      <EventSilhouette type={visualType} placement="summary" />
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <strong>{booking.provider || booking.title}</strong>
        {booking.reference_code && (
          <span className="text-muted">
            {booking.type === "flight" ? "PNR" : "Ref"}{" "}
            <strong className="text-ink">{booking.reference_code}</strong>
          </span>
        )}
        {status && (
          <span className="rounded-full bg-brand-soft px-2 py-0.5 font-black capitalize text-brand">
            {status.replaceAll("_", " ")}
          </span>
        )}
      </div>
      {route && <p className="mt-1 font-bold text-brand">{route}</p>}
      {children}
    </div>
  );
}
