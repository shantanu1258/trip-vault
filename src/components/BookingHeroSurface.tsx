import type { ReactNode } from "react";
import type { TimelineEventType } from "../features/trips/types";
import { eventIconTone } from "./EventTypeIcon";
import { EventSilhouette } from "./EventSilhouette";

/** Shared animated booking surface; data and actions remain owned by each page. */
export function BookingHeroSurface({
  type,
  children
}: {
  type: TimelineEventType;
  children: ReactNode;
}) {
  return (
    <header
      className={`event-hero event-type-icon--${eventIconTone(type)} overflow-hidden rounded-xl border border-line p-4 text-white shadow-focus`}
    >
      <EventSilhouette type={type} placement="hero" />
      {children}
    </header>
  );
}
