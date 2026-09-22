import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { addActivityMoment, listActivityMoments } from "../activity-moments/api";
import type { ActivityMoment } from "../activity-moments/types";
import { addCabStop, listCabStopsForTrip, listJourneyLegsForBooking } from "../workspace/api";
import type { CabStop } from "../workspace/types";
import { listItinerary } from "./api";

export type CostEventConnection = {
  bookingId: string | null;
  itineraryItemId: string | null;
  cabStopId: string | null;
  activityMomentId: string | null;
};

export const newActivityMomentValue = "__new_activity_moment__";
export const newCabStopValue = "__new_cab_stop__";

export function useCostEventConnection({
  tripId,
  enabled,
  initialItineraryItemId,
  initialBookingId,
  initialCabStopId,
  initialActivityMomentId
}: {
  tripId: string;
  enabled: boolean;
  initialItineraryItemId?: string | null;
  initialBookingId?: string | null;
  initialCabStopId?: string | null;
  initialActivityMomentId?: string | null;
}) {
  const queryClient = useQueryClient();
  const [selectedEventId, setSelectedEventId] = useState(initialItineraryItemId ?? "");
  const [selectedCabStopId, setSelectedCabStopId] = useState(initialCabStopId ?? "");
  const [selectedActivityMomentId, setSelectedActivityMomentId] = useState(
    initialActivityMomentId ?? ""
  );
  const eventsQuery = useQuery({
    queryKey: ["itinerary", tripId],
    queryFn: () => listItinerary(tripId),
    enabled
  });
  const events = useMemo(
    () => (eventsQuery.data ?? []).filter((item) => !item.deleted_at),
    [eventsQuery.data]
  );

  useEffect(() => {
    if (selectedEventId || !initialBookingId || !events.length) return;
    const linkedEvent = events.find((item) => item.booking_id === initialBookingId);
    if (linkedEvent) setSelectedEventId(linkedEvent.id);
  }, [events, initialBookingId, selectedEventId]);

  const selectedEvent = events.find((item) => item.id === selectedEventId);
  const activityMomentsQuery = useQuery({
    queryKey: ["activity-moments", selectedEvent?.id],
    queryFn: () => listActivityMoments(selectedEvent!.id),
    enabled: enabled && selectedEvent?.event_type === "activity"
  });
  const journeyLegsQuery = useQuery({
    queryKey: ["journey-legs", tripId, selectedEvent?.booking_id],
    queryFn: () => listJourneyLegsForBooking(selectedEvent!.booking_id!, tripId),
    enabled: enabled && selectedEvent?.event_type === "cab" && Boolean(selectedEvent.booking_id)
  });
  const cabLegs = (journeyLegsQuery.data ?? []).filter((leg) => leg.mode === "cab");
  const cabLegIds = cabLegs.map((leg) => leg.id);
  const cabStopsQuery = useQuery({
    queryKey: ["cab-stops", tripId, cabLegIds],
    queryFn: () => listCabStopsForTrip(tripId, cabLegIds),
    enabled: enabled && journeyLegsQuery.isSuccess && cabLegIds.length > 0
  });

  const selectEvent = (eventId: string) => {
    setSelectedEventId(eventId);
    setSelectedCabStopId("");
    setSelectedActivityMomentId("");
  };
  const connection: CostEventConnection = {
    bookingId: selectedEvent?.booking_id ?? null,
    itineraryItemId: selectedEvent?.id ?? null,
    cabStopId:
      selectedEvent?.event_type === "cab" && selectedCabStopId !== newCabStopValue
        ? selectedCabStopId || null
        : null,
    activityMomentId:
      selectedEvent?.event_type === "activity" &&
      selectedActivityMomentId !== newActivityMomentValue
        ? selectedActivityMomentId || null
        : null
  };
  const resolveConnection = async (title: string): Promise<CostEventConnection> => {
    if (
      selectedEvent?.event_type === "activity" &&
      selectedActivityMomentId === newActivityMomentValue
    ) {
      const moment = await addActivityMoment({
        tripId,
        itineraryItemId: selectedEvent.id,
        title,
        timezone: selectedEvent.timezone
      });
      queryClient.setQueryData<ActivityMoment[]>(
        ["activity-moments", selectedEvent.id],
        (current = []) => [...current.filter((item) => item.id !== moment.id), moment]
      );
      setSelectedActivityMomentId(moment.id);
      return { ...connection, activityMomentId: moment.id };
    }
    if (selectedEvent?.event_type === "cab" && selectedCabStopId === newCabStopValue) {
      const leg = cabLegs[0];
      if (!leg) throw new Error("Cab details are still loading. Try saving again in a moment.");
      const stop = await addCabStop({
        tripId,
        journeyLegId: leg.id,
        title,
        timezone: selectedEvent.timezone
      });
      queryClient.setQueryData<CabStop[]>(["cab-stops", tripId, cabLegIds], (current = []) => [
        ...current.filter((item) => item.id !== stop.id),
        stop
      ]);
      setSelectedCabStopId(stop.id);
      return { ...connection, cabStopId: stop.id };
    }
    return connection;
  };

  return {
    events,
    eventsQuery,
    selectedEvent,
    selectedEventId,
    selectedCabStopId,
    selectedActivityMomentId,
    activityMomentsQuery,
    cabStopsQuery,
    connection,
    resolveConnection,
    selectEvent,
    setSelectedCabStopId,
    setSelectedActivityMomentId
  };
}

export function CostEventConnectionFields({
  value,
  eventLabel = "Event",
  emptyLabel = "Select an event"
}: {
  value: ReturnType<typeof useCostEventConnection>;
  eventLabel?: string;
  emptyLabel?: string;
}) {
  return (
    <>
      <label className="form-label">
        {eventLabel}
        <select
          className="form-input"
          value={value.selectedEventId}
          onChange={(event) => value.selectEvent(event.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {value.events.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      {value.eventsQuery.isLoading && <p className="text-xs text-muted">Loading events…</p>}
      {value.eventsQuery.isError && (
        <p role="alert" className="text-sm text-danger">
          Could not load events. Please reopen this form to retry.
        </p>
      )}
      {value.selectedEvent?.event_type === "activity" && (
        <label className="form-label">
          Moment (optional)
          <select
            className="form-input"
            value={value.selectedActivityMomentId}
            onChange={(event) => value.setSelectedActivityMomentId(event.target.value)}
          >
            <option value="">Whole activity</option>
            {(value.activityMomentsQuery.data ?? []).map((moment) => (
              <option key={moment.id} value={moment.id}>
                {moment.title}
              </option>
            ))}
            <option value={newActivityMomentValue}>Add as a new Moment</option>
          </select>
        </label>
      )}
      {value.selectedEvent?.event_type === "cab" && (
        <label className="form-label">
          Cab stop (optional)
          <select
            className="form-input"
            value={value.selectedCabStopId}
            onChange={(event) => value.setSelectedCabStopId(event.target.value)}
          >
            <option value="">Whole cab journey</option>
            {(value.cabStopsQuery.data ?? []).map((stop) => (
              <option key={stop.id} value={stop.id}>
                {stop.title}
              </option>
            ))}
            <option value={newCabStopValue}>Add as a new stop</option>
          </select>
        </label>
      )}
      {(value.activityMomentsQuery.isLoading || value.cabStopsQuery.isLoading) && (
        <p className="text-xs text-muted">Loading choices…</p>
      )}
      {(value.activityMomentsQuery.isError || value.cabStopsQuery.isError) && (
        <p role="alert" className="text-sm text-danger">
          Could not load the activity Moments or cab stops. Please reopen this form to retry.
        </p>
      )}
    </>
  );
}
