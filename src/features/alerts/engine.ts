import type { AlertState, ItineraryItem, Reminder, Trip } from "../trips/types";
import type { FlightLeg, Requirement } from "../workspace/types";
import type { VaultDocument } from "../workspace/types";
import { delayMinutes, effectiveDeparture } from "../workspace/flight";
import { requirementTimelineSchedule } from "../timeline/model";
import { formatDurationMinutes } from "../../lib/formatDuration";

export type DerivedAlert = {
  key: string;
  tripId: string | null;
  title: string;
  detail: string;
  group: "urgent" | "today" | "upcoming";
  target?: string;
};

function groupForDate(date: Date, now: Date): DerivedAlert["group"] {
  const deltaHours = (date.getTime() - now.getTime()) / 3_600_000;
  if (deltaHours <= 0) return "urgent";
  if (date.toDateString() === now.toDateString() || deltaHours <= 24) return "today";
  return "upcoming";
}

export function deriveAlerts(
  input: {
    trips: Trip[];
    flights: FlightLeg[];
    requirements: Requirement[];
    itinerary?: ItineraryItem[];
    reminders: Reminder[];
    states?: AlertState[];
    documents?: VaultDocument[];
    offlineManifests?: { tripId: string; state: string; checkedAt: string }[];
    conflicts?: { entityId: string; entityType: string }[];
    now?: Date;
  },
  view: "visible" | "dismissed" = "visible"
) {
  const now = input.now ?? new Date();
  const alerts: DerivedAlert[] = [];
  const groupPriority = { urgent: 0, today: 1, upcoming: 2 } as const;
  const tripByBooking = new Map<string, string>();
  // Flight rows do not duplicate trip_id; callers may annotate it for pure derivation.
  input.flights.forEach((flight) => {
    const tripId =
      (flight as FlightLeg & { trip_id?: string }).trip_id ??
      tripByBooking.get(flight.booking_id) ??
      null;
    if (flight.status === "cancelled")
      alerts.push({
        key: `flight-cancelled:${flight.id}:${flight.status_updated_at}`,
        tripId,
        title: `${flight.flight_number} is marked cancelled`,
        detail: flight.status_note || "Review the flight and update your plans.",
        group: "urgent",
        target: tripId ? `/trips/${tripId}/flights/${flight.id}` : undefined
      });
    if (flight.status === "delayed")
      alerts.push({
        key: `flight-delayed:${flight.id}:${flight.estimated_departure_at}`,
        tripId,
        title: `${flight.flight_number} delayed ${formatDurationMinutes(delayMinutes(flight), { style: "long" })}`,
        detail: flight.status_note || "Updated manually by a traveler.",
        group: groupForDate(new Date(effectiveDeparture(flight)), now),
        target: tripId ? `/trips/${tripId}/flights/${flight.id}` : undefined
      });
    const minutes = (new Date(effectiveDeparture(flight)).getTime() - now.getTime()) / 60_000;
    if (
      !["cancelled", "departed", "landed"].includes(flight.status) &&
      minutes > 0 &&
      minutes <= 180
    )
      alerts.push({
        key: `flight-approaching:${flight.id}:${effectiveDeparture(flight)}`,
        tripId,
        title: `${flight.flight_number} departs soon`,
        detail: `${formatDurationMinutes(Math.ceil(minutes), { style: "long" })} until the current departure time.`,
        group: minutes <= 90 ? "today" : "upcoming",
        target: tripId ? `/trips/${tripId}/flights/${flight.id}` : undefined
      });
    const hasBoardingPass = (input.documents ?? []).some(
      (document) =>
        document.purpose === "boarding_pass" &&
        (document.flight_leg_id === flight.id || document.booking_id === flight.booking_id)
    );
    if (
      flight.boarding_at &&
      new Date(flight.boarding_at) <= now &&
      !hasBoardingPass &&
      !["cancelled", "departed", "landed"].includes(flight.status)
    )
      alerts.push({
        key: `flight-missing-boarding-pass:${flight.id}:${flight.boarding_at}`,
        tripId,
        title: `Boarding pass missing for ${flight.flight_number}`,
        detail: "The manually entered boarding time has passed and no boarding pass is attached.",
        group: "urgent",
        target: tripId ? `/trips/${tripId}/flights/${flight.id}` : undefined
      });
  });
  input.requirements.forEach((requirement) => {
    if (["complete", "not_required"].includes(requirement.status)) return;
    const trip = input.trips.find((item) => item.id === requirement.trip_id);
    const schedule = trip
      ? requirementTimelineSchedule(
          requirement,
          (input.itinerary ?? []).filter((item) => item.trip_id === requirement.trip_id),
          trip.primary_timezone
        )
      : null;
    if (schedule) {
      const due = new Date(schedule.startsAt);
      if ((due.getTime() - now.getTime()) / 86_400_000 <= 14)
        alerts.push({
          key: `requirement-due:${requirement.id}:${schedule.startsAt}`,
          tripId: requirement.trip_id,
          title: requirement.title,
          detail: due < now ? `${schedule.label} · This task is overdue.` : schedule.label,
          group: groupForDate(due, now),
          target: `/trips/${requirement.trip_id}/readiness?task=${encodeURIComponent(requirement.id)}`
        });
    }
    if (requirement.expires_on) {
      if (trip) {
        const safeUntil = new Date(`${trip.end_date}T12:00:00`);
        safeUntil.setDate(safeUntil.getDate() + (requirement.validity_buffer_days ?? 0));
        const expiry = new Date(`${requirement.expires_on}T12:00:00`);
        if (expiry < safeUntil)
          alerts.push({
            key: `requirement-expiry:${requirement.id}:${requirement.expires_on}:${requirement.validity_buffer_days ?? 0}`,
            tripId: requirement.trip_id,
            title: `${requirement.title} may expire too early`,
            detail:
              "This is an advisory check against the validity buffer you entered. Verify official requirements.",
            group: "urgent",
            target: `/trips/${requirement.trip_id}/readiness?task=${encodeURIComponent(requirement.id)}`
          });
      }
    }
  });
  input.reminders.forEach((reminder) =>
    alerts.push({
      key: `reminder:${reminder.id}:${reminder.due_at}`,
      tripId: reminder.trip_id,
      title: reminder.title,
      detail: `Reminder for ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(reminder.due_at))}.`,
      group:
        reminder.severity === "urgent" ? "urgent" : groupForDate(new Date(reminder.due_at), now),
      target: reminder.trip_id ? `/trips/${reminder.trip_id}` : undefined
    })
  );
  (input.offlineManifests ?? [])
    .filter((manifest) => ["stale", "failed", "insufficient_space"].includes(manifest.state))
    .forEach((manifest) =>
      alerts.push({
        key: `offline-pack:${manifest.tripId}:${manifest.state}:${manifest.checkedAt}`,
        tripId: manifest.tripId,
        title:
          manifest.state === "insufficient_space"
            ? "Not enough space for offline trip"
            : "Offline trip needs attention",
        detail: "Open the trip while online and prepare its current plans and documents again.",
        group: "urgent",
        target: `/trips/${manifest.tripId}?view=details&section=offline`
      })
    );
  (input.conflicts ?? []).forEach((conflict) =>
    alerts.push({
      key: `sync-conflict:${conflict.entityType}:${conflict.entityId}`,
      tripId: null,
      title: "An offline edit conflicts with a newer change",
      detail:
        "Your local edit was preserved. Reopen the affected item after synchronization to resolve it.",
      group: "urgent"
    })
  );
  const stateByKey = new Map((input.states ?? []).map((state) => [state.alert_key, state]));
  return alerts
    .filter((alert) => {
      const state = stateByKey.get(alert.key);
      if (view === "dismissed") return Boolean(state?.dismissed_at);
      return (
        !state?.dismissed_at && (!state?.snoozed_until || new Date(state.snoozed_until) <= now)
      );
    })
    .sort(
      (left, right) =>
        groupPriority[left.group] - groupPriority[right.group] || left.key.localeCompare(right.key)
    );
}

export function unreadAlertCount(alerts: DerivedAlert[], states: AlertState[]) {
  const read = new Set(states.filter((state) => state.read_at).map((state) => state.alert_key));
  return alerts.filter((alert) => !read.has(alert.key)).length;
}
