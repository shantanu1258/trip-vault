import { useQuery } from "@tanstack/react-query";
import { CalendarClock, MapPin, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EventSilhouette } from "../components/EventSilhouette";
import { TripBackLink } from "../components/TripBackLink";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { PlanningItemsManager } from "../features/planning/PlanningItems";
import { tripQueries } from "../features/queries/tripQueries";
import { localProfileId } from "../features/sync/localSync";
import { tripChildNavigationState, tripReturnNavigation } from "../features/trips/navigation";
import { formatEventTime } from "../features/trips/presentation";
import { listTripItineraryParticipants } from "../features/workspace/api";
import { canEditTrip } from "../features/workspace/permissions";

export function PlanningPage() {
  const { tripId = "", planningEventId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [userId, setUserId] = useState("");
  const [modalHost, setModalHost] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    void localProfileId().then((id) => setUserId(id ?? ""));
  }, []);

  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ ...tripQueries.itinerary(tripId), enabled: Boolean(tripId) });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ ...tripQueries.members(tripId), enabled: Boolean(tripId) });
  const itineraryIds = (itineraryQuery.data ?? []).map((item) => item.id);
  const participantsQuery = useQuery({
    queryKey: ["itinerary-participants", tripId, itineraryIds],
    queryFn: () => listTripItineraryParticipants(tripId, itineraryIds),
    enabled: Boolean(tripId) && itineraryQuery.isSuccess
  });

  const planningEvent = itineraryQuery.data?.find(
    (item) => item.id === planningEventId && item.event_type === "preparation"
  );
  const travelerIds = (participantsQuery.data ?? [])
    .filter((row) => row.itinerary_item_id === planningEventId)
    .map((row) => row.traveler_id);
  const travelers = travelersQuery.data ?? [];
  const includedTravelers = planningEvent?.applies_to_all_travelers
    ? travelers
    : travelers.filter((traveler) => travelerIds.includes(traveler.id));
  const role = membersQuery.data?.find((member) => member.user_id === userId)?.role;
  const editable = canEditTrip(role);
  const returnNavigation = tripReturnNavigation(location.state, tripId);
  const currentPath = `${location.pathname}${location.search}`;
  const loading =
    tripQuery.isLoading ||
    itineraryQuery.isLoading ||
    travelersQuery.isLoading ||
    membersQuery.isLoading ||
    participantsQuery.isLoading;
  const error =
    tripQuery.error ??
    itineraryQuery.error ??
    travelersQuery.error ??
    membersQuery.error ??
    participantsQuery.error;

  return (
    <AppShell compactTop>
      <div className="mx-auto max-w-3xl pb-20">
        <div className="py-2">
          <TripBackLink {...returnNavigation} />
        </div>
        {loading && <LoadingCard label="Loading plan" />}
        {error && <ErrorCard error={error} />}
        {!loading && !error && !planningEvent && (
          <ErrorCard error={new Error("This day plan is no longer available.")} />
        )}
        {!loading && !error && planningEvent && (
          <div className="page-enter space-y-3">
            <header className="event-hero event-type-icon--preparation relative isolate overflow-hidden rounded-2xl border border-line p-4 pr-24 text-white shadow-focus sm:p-5 sm:pr-32">
              <EventSilhouette type="preparation" placement="hero" />
              <div className="relative z-[1]">
                <p className="text-xs font-black uppercase tracking-[.14em] text-white/75">
                  Day plan
                </p>
                <h1 className="mt-2 break-words font-display text-2xl font-black tracking-[-.025em] sm:text-3xl">
                  {planningEvent.title}
                </h1>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm font-bold text-white/85">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-4" />
                    {formatEventTime(planningEvent.starts_at, planningEvent.timezone)}
                  </span>
                  {planningEvent.location?.label && (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <MapPin className="size-4 shrink-0" />
                      <span className="truncate">{planningEvent.location.label}</span>
                    </span>
                  )}
                </div>
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/80">
                  <UsersRound className="size-4" />
                  {planningEvent.applies_to_all_travelers
                    ? "Everyone"
                    : includedTravelers.map((traveler) => traveler.display_name).join(", ") ||
                      "Selected travelers"}
                </p>
              </div>
            </header>

            <PlanningItemsManager
              tripId={tripId}
              planningEvent={planningEvent}
              travelerIds={travelerIds}
              itinerary={itineraryQuery.data ?? []}
              editable={editable}
              focusedItemId={searchParams.get("item")}
              modalHost={modalHost}
              onFocusedItemChange={(itemId) => {
                const next = new URLSearchParams(searchParams);
                if (itemId) next.set("item", itemId);
                else next.delete("item");
                setSearchParams(next, {
                  replace: !itemId || searchParams.has("item"),
                  state: location.state
                });
              }}
              onOpenEvent={(eventId) =>
                navigate(`/trips/${tripId}?event=${eventId}`, {
                  state: tripChildNavigationState(location.state, tripId, "timeline", currentPath)
                })
              }
            />
          </div>
        )}
      </div>
      <div ref={setModalHost} data-plan-modal-host="true" />
    </AppShell>
  );
}
