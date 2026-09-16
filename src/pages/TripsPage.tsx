import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, Map } from "lucide-react";
import { AppShell } from "../components/AppShell";
import {
  EmptyState,
  ErrorCard,
  LoadingCard,
  PageHeader,
  PrimaryLink,
  TripCard
} from "../components/TripUi";
import {
  listDeletedTrips,
  listTrips,
  restoreDeletedTrip,
  restoreTrip
} from "../features/trips/api";
import type { Trip } from "../features/trips/types";
import { sortTripsByRelevance, tripPhase } from "../features/trips/presentation";

export function TripsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["trips", "including-archived"],
    queryFn: () => listTrips(true)
  });
  const trips = sortTripsByRelevance(
    (query.data ?? []).filter((trip) => trip.status !== "archived")
  );
  const archived = (query.data ?? []).filter((trip) => trip.status === "archived");
  const deletedQuery = useQuery({
    queryKey: ["trips", "recently-deleted"],
    queryFn: listDeletedTrips,
    enabled: navigator.onLine
  });
  const restore = useMutation({
    mutationFn: (trip: Trip) => restoreTrip(trip),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trips"] }),
        queryClient.invalidateQueries({ queryKey: ["trips", "including-archived"] })
      ]);
    }
  });
  const restoreDeleted = useMutation({
    mutationFn: (trip: Trip) => restoreDeletedTrip(trip),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
    }
  });

  return (
    <AppShell>
      <div className="mx-auto min-w-0 max-w-5xl overflow-x-clip">
        <PageHeader
          eyebrow="Your journeys"
          title="Trips"
          text="Every shared plan, booking, cost, and travel document starts here."
          action={<PrimaryLink to="/trips/new">Create trip</PrimaryLink>}
        />
        {query.isLoading && <LoadingCard label="Loading trips" />}
        {query.error && <ErrorCard error={query.error} />}
        {!query.isLoading && !query.error && trips.length === 0 && archived.length === 0 && (
          <EmptyState
            icon={<Map className="size-7" />}
            title="Create your first trip"
            text="Add its dates and destination, then the app will guide you through itinerary, costs, people, and documents."
            action={<PrimaryLink to="/trips/new">Create a trip</PrimaryLink>}
          />
        )}
        {trips.length > 0 && (
          <div className="mt-7 space-y-8">
            {(["current", "upcoming", "past"] as const).map((phase) => {
              const matches = trips.filter((trip) => tripPhase(trip) === phase);
              if (!matches.length) return null;
              return (
                <section className="min-w-0" key={phase}>
                  <h2 className="eyebrow mb-3 capitalize">
                    {phase === "past" ? "Past trips" : `${phase} trips`}
                  </h2>
                  <div className="grid min-w-0 gap-4 md:grid-cols-2">
                    {matches.map((trip) => (
                      <TripCard key={trip.id} trip={trip} emphasized={phase === "current"} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
        {archived.length > 0 && (
          <section className="mt-8">
            <h2 className="eyebrow mb-3">Archived trips</h2>
            <div className="grid min-w-0 gap-4 md:grid-cols-2">
              {archived.map((trip) => (
                <div className="min-w-0" key={trip.id}>
                  <TripCard trip={trip} />
                  <button
                    type="button"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(trip)}
                    className="secondary-button mt-2 w-full justify-center"
                  >
                    <ArchiveRestore className="size-4" /> Restore trip
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
        {(deletedQuery.data?.length ?? 0) > 0 && (
          <section className="mt-8 border-t border-line pt-7">
            <h2 className="eyebrow">Recently deleted</h2>
            <p className="mt-2 text-sm text-muted">Recoverable for 30 days from deletion.</p>
            <div className="mt-3 grid min-w-0 gap-3 md:grid-cols-2">
              {deletedQuery.data?.map((trip) => (
                <article
                  className="surface-card min-w-0 max-w-full overflow-hidden p-5"
                  key={trip.id}
                >
                  <h3 className="break-words font-display text-xl font-black [overflow-wrap:anywhere]">
                    {trip.title}
                  </h3>
                  <p className="mt-1 break-words text-sm text-muted [overflow-wrap:anywhere]">
                    {trip.destination_summary}
                  </p>
                  <button
                    type="button"
                    disabled={restoreDeleted.isPending}
                    onClick={() => restoreDeleted.mutate(trip)}
                    className="secondary-button mt-4"
                  >
                    <ArchiveRestore className="size-4" /> Restore deleted trip
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
