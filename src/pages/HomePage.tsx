import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CloudDownload,
  FileCheck2,
  MapPin,
  MapPinned,
  Plus,
  Sparkles,
  TicketCheck,
  UserPlus,
  UsersRound,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { EventTypeIcon } from "../components/EventTypeIcon";
import {
  CompactCostTotal,
  ErrorCard,
  LoadingCard,
  PageHeader,
  TripCard
} from "../components/TripUi";
import { getSavedTripFocus, saveTripFocus } from "../features/trips/api";
import { calculateTripBalances } from "../features/trips/expenses";
import {
  formatDateRange,
  formatEventTime,
  selectFocusedTrip,
  sortTripsByRelevance,
  tripPhase
} from "../features/trips/presentation";
import { CostDetailsSheet, TripExpensesSheet } from "../features/trips/TripExpenses";
import type { TripCost } from "../features/trips/types";
import { listIncomingTripOffers, respondToTripOffer } from "../features/workspace/api";
import { documentsForTravelerAccounts, resolveNeedNow } from "../features/home/needNow";
import { alertInputsQueryOptions } from "../features/alerts/load";
import { deriveAlerts } from "../features/alerts/engine";
import { tripQueries } from "../features/queries/tripQueries";

const firstTripSteps = [
  {
    icon: MapPinned,
    number: "01",
    title: "Create the trip",
    text: "Add the destination, dates, and currency. Journey time zones come from each ticket."
  },
  {
    icon: UsersRound,
    number: "02",
    title: "Add your people",
    text: "Create traveler profiles for friends, parents, and children."
  },
  {
    icon: TicketCheck,
    number: "03",
    title: "Build the travel plan",
    text: "Add bookings, itinerary events, costs, and the documents they need."
  },
  {
    icon: CloudDownload,
    number: "04",
    title: "Prepare it offline",
    text: "Download and verify the trip before you leave reliable internet."
  }
];

export function EmptyHomeDashboard() {
  return (
    <>
      <section className="page-enter mt-7 overflow-hidden rounded-3xl border border-brand/20 bg-brand p-6 text-surface shadow-focus sm:p-8">
        <div className="max-w-2xl">
          <span className="grid size-12 place-items-center rounded-2xl bg-surface/10">
            <MapPinned className="size-5" />
          </span>
          <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-surface/60">
            Your private travel space is ready
          </p>
          <h2 className="mt-3 font-display text-3xl font-black tracking-[-0.045em] sm:text-5xl">
            Where are you going next?
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-7 text-surface/70 sm:text-base">
            Start a trip you will organize, or enter the private code someone shared with you. Your
            Home page will then surface the next booking, task, and document automatically.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              to="/trips/new"
              className="tap-target inline-flex items-center justify-center gap-2 rounded-2xl bg-surface px-5 py-3 font-extrabold text-brand"
            >
              Create your first trip <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/join"
              className="tap-target inline-flex items-center justify-center gap-2 rounded-2xl border border-surface/25 px-5 py-3 font-extrabold text-surface"
            >
              <UserPlus className="size-4" /> Join with a code
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <p className="eyebrow">How setup works</p>
        <h2 className="mt-2 font-display text-2xl font-black tracking-[-0.035em]">
          From empty to travel-ready
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {firstTripSteps.map(({ icon: Icon, number, title, text }) => (
            <article key={number} className="surface-card page-enter flex items-start gap-4 p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
                <Icon className="size-5" />
              </span>
              <div>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.14em] text-coral">
                  Step {number}
                </p>
                <h3 className="mt-1 font-display text-lg font-black">{title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted">{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function HomePage() {
  const queryClient = useQueryClient();
  const [savedFocus, setSavedFocus] = useState<string | null>(null);
  const [showingExpenses, setShowingExpenses] = useState(false);
  const [viewingCost, setViewingCost] = useState<TripCost | null>(null);
  const offersQuery = useQuery({
    queryKey: ["incoming-trip-offers"],
    queryFn: listIncomingTripOffers,
    enabled: navigator.onLine
  });
  const respondToOffer = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) => respondToTripOffer(id, accept),
    onSuccess: async (_, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["incoming-trip-offers"] }),
        input.accept ? queryClient.invalidateQueries({ queryKey: ["trips"] }) : Promise.resolve()
      ]);
    }
  });
  const tripsQuery = useQuery(tripQueries.trips());
  const trips = sortTripsByRelevance(tripsQuery.data ?? []);
  const focusedTrip = selectFocusedTrip(trips, savedFocus);
  const overlappingTrips = trips.filter((trip) => tripPhase(trip) === "current");
  useEffect(() => {
    getSavedTripFocus()
      .then(setSavedFocus)
      .catch(() => undefined);
  }, []);
  const chooseFocus = (tripId: string) => {
    setSavedFocus(tripId);
    setShowingExpenses(false);
    setViewingCost(null);
    saveTripFocus(tripId).catch(() => undefined);
  };
  const focusedTripId = focusedTrip?.id ?? "";
  const costsQuery = useQuery({
    ...tripQueries.costs(focusedTripId),
    enabled: Boolean(focusedTrip)
  });
  const itineraryQuery = useQuery({
    ...tripQueries.itinerary(focusedTripId),
    enabled: Boolean(focusedTrip)
  });
  const bookingsQuery = useQuery({
    ...tripQueries.bookings(focusedTripId),
    enabled: Boolean(focusedTrip)
  });
  const flightsQuery = useQuery({
    ...tripQueries.flights(focusedTripId, bookingsQuery.data),
    enabled: Boolean(focusedTrip) && bookingsQuery.isSuccess
  });
  const requirementsQuery = useQuery({
    ...tripQueries.requirements(focusedTripId),
    enabled: Boolean(focusedTrip)
  });
  const travelersQuery = useQuery({
    ...tripQueries.travelers(focusedTripId),
    enabled: Boolean(focusedTrip)
  });
  const documentsQuery = useQuery({
    ...tripQueries.documents(focusedTripId),
    enabled: Boolean(focusedTrip)
  });
  const accountTravelerIdsQuery = useQuery({
    ...tripQueries.currentAccountTravelerIds(
      focusedTripId,
      (travelersQuery.data ?? []).map((traveler) => traveler.id)
    ),
    enabled: Boolean(focusedTrip) && travelersQuery.isSuccess
  });
  const itineraryIds = (itineraryQuery.data ?? []).map((item) => item.id);
  const eventDocumentReferencesQuery = useQuery({
    ...tripQueries.eventDocumentReferences(focusedTripId, itineraryIds),
    enabled: Boolean(focusedTrip) && itineraryQuery.isSuccess
  });
  const alertsQuery = useQuery(alertInputsQueryOptions(queryClient));
  const criticalAlert = alertsQuery.data
    ? deriveAlerts(alertsQuery.data).find(
        (alert) =>
          alert.group === "urgent" &&
          (!focusedTrip || !alert.tripId || alert.tripId === focusedTrip.id)
      )
    : undefined;
  const now = Date.now();
  const nextItem =
    itineraryQuery.data?.find(
      (item) => new Date(item.ends_at ?? item.starts_at).getTime() >= now
    ) ?? itineraryQuery.data?.at(-1);
  const homeDocuments = documentsForTravelerAccounts(
    documentsQuery.data ?? [],
    accountTravelerIdsQuery.data ?? []
  );
  const needNow = focusedTrip
    ? resolveNeedNow({
        tripId: focusedTrip.id,
        bookings: bookingsQuery.data ?? [],
        flights: flightsQuery.data ?? [],
        requirements: requirementsQuery.data ?? [],
        documents: homeDocuments,
        itinerary: itineraryQuery.data ?? [],
        eventDocumentReferences: eventDocumentReferencesQuery.data ?? [],
        travelers: travelersQuery.data ?? []
      })
    : [];
  const balances = useMemo(() => calculateTripBalances(costsQuery.data ?? []), [costsQuery.data]);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow={focusedTrip ? "Your home" : "Welcome to Trip Vault"}
          title={focusedTrip ? "Ready when you are" : "Let's get your first trip ready"}
          text={
            focusedTrip
              ? "The nearest useful trip and its next action appear first."
              : "Everything here belongs to your signed-in account. Begin with a new trip or a private invitation code."
          }
        />
        {(offersQuery.data?.length ?? 0) > 0 && (
          <section className="mt-5 rounded-3xl border border-brand/25 bg-brand-soft p-5 sm:p-6">
            <p className="eyebrow">Trip invitations</p>
            <h2 className="mt-2 font-display text-2xl font-black">
              Someone you know shared a trip
            </h2>
            <div className="mt-4 space-y-3">
              {offersQuery.data?.map((offer) => (
                <article key={offer.id} className="rounded-2xl border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-black">{offer.trip_title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {offer.destination_summary} · {offer.start_date} → {offer.end_date}
                      </p>
                      <p className="mt-2 text-xs text-muted">
                        From {offer.offered_by_name} ·{" "}
                        {offer.target_type === "traveler"
                          ? `Join as ${offer.traveler_name ?? "traveler"}`
                          : "Join as a non-traveling helper"}{" "}
                        · {offer.role}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="secondary-button text-danger"
                        disabled={respondToOffer.isPending}
                        onClick={() => respondToOffer.mutate({ id: offer.id, accept: false })}
                      >
                        <X className="size-4" /> Decline
                      </button>
                      <button
                        type="button"
                        className="primary-button"
                        disabled={respondToOffer.isPending}
                        onClick={() => respondToOffer.mutate({ id: offer.id, accept: true })}
                      >
                        <Check className="size-4" /> Accept trip
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            {respondToOffer.error && (
              <p role="alert" className="mt-3 text-sm font-bold text-danger">
                This invitation could not be updated. Refresh and try again.
              </p>
            )}
          </section>
        )}
        {criticalAlert && (
          <section
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-2xl border border-danger/35 bg-danger/10 p-4"
          >
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">{criticalAlert.title}</p>
              <p className="mt-1 text-sm text-muted">{criticalAlert.detail}</p>
              {criticalAlert.target && (
                <Link
                  to={criticalAlert.target}
                  className="mt-2 inline-flex text-sm font-extrabold text-danger"
                >
                  Review now
                </Link>
              )}
            </div>
          </section>
        )}
        {tripsQuery.isLoading && <LoadingCard />}
        {tripsQuery.error && (
          <ErrorCard error={tripsQuery.error} title="Your trips could not be reached" />
        )}
        {!tripsQuery.isLoading && !tripsQuery.error && !focusedTrip && <EmptyHomeDashboard />}
        {focusedTrip && (
          <>
            <section
              className={`page-enter group relative mt-7 overflow-hidden rounded-3xl border p-6 shadow-focus transition-transform duration-200 hover:-translate-y-0.5 sm:p-8 motion-reduce:hover:translate-y-0 ${tripPhase(focusedTrip) === "current" ? "border-coral bg-brand text-surface motion-safe:scale-[1.01]" : "border-line bg-surface"}`}
            >
              <Link
                to={`/trips/${focusedTrip.id}`}
                className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-coral"
                aria-label={`Open ${focusedTrip.title}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span
                  className={`rounded-full px-3 py-1.5 text-[0.65rem] font-black uppercase tracking-[0.15em] ${tripPhase(focusedTrip) === "current" ? "bg-coral text-surface" : "bg-brand-soft text-brand"}`}
                >
                  {tripPhase(focusedTrip) === "current" ? "Current trip" : "Coming up"}
                </span>
                <span
                  className={`text-xs font-bold ${tripPhase(focusedTrip) === "current" ? "text-surface/70" : "text-muted"}`}
                >
                  {formatDateRange(focusedTrip.start_date, focusedTrip.end_date)}
                </span>
              </div>
              <h2 className="mt-6 font-display text-3xl font-black tracking-[-0.045em] sm:text-5xl">
                {focusedTrip.title}
              </h2>
              <p
                className={`mt-3 flex items-center gap-2 ${tripPhase(focusedTrip) === "current" ? "text-surface/70" : "text-muted"}`}
              >
                <MapPin className="size-4" />
                {focusedTrip.destination_summary}
              </p>
              {nextItem ? (
                <div
                  className={`mt-7 rounded-2xl p-4 ${tripPhase(focusedTrip) === "current" ? "bg-surface/10" : "bg-elevated"}`}
                >
                  <p
                    className={`text-[0.65rem] font-black uppercase tracking-[0.15em] ${tripPhase(focusedTrip) === "current" ? "text-surface/60" : "text-muted"}`}
                  >
                    Next on your itinerary
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-display text-xl font-black">{nextItem.title}</p>
                      <p
                        className={`mt-1 text-sm ${tripPhase(focusedTrip) === "current" ? "text-surface/70" : "text-muted"}`}
                      >
                        {formatEventTime(nextItem.starts_at, nextItem.timezone)}
                      </p>
                    </div>
                    <EventTypeIcon
                      type={nextItem.event_type ?? "custom"}
                      className="size-10 rounded-xl"
                      iconClassName="size-4"
                    />
                  </div>
                </div>
              ) : (
                <p
                  className={`mt-7 text-sm ${tripPhase(focusedTrip) === "current" ? "text-surface/70" : "text-muted"}`}
                >
                  No itinerary yet. Add the first event so the app knows what you need next.
                </p>
              )}
              <Link
                to={`/trips/${focusedTrip.id}`}
                className={`tap-target relative z-20 mt-6 inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-extrabold ${tripPhase(focusedTrip) === "current" ? "bg-surface text-brand" : "bg-brand text-surface"}`}
              >
                Open trip{" "}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
              </Link>
            </section>
            {overlappingTrips.length > 1 && (
              <section className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface p-3">
                <span className="mr-1 text-xs font-bold text-muted">Current trip:</span>
                {overlappingTrips.map((trip) => (
                  <button
                    type="button"
                    key={trip.id}
                    onClick={() => chooseFocus(trip.id)}
                    aria-pressed={focusedTrip.id === trip.id}
                    className={`tap-target min-h-9 rounded-xl px-3 text-xs font-extrabold ${focusedTrip.id === trip.id ? "bg-brand text-surface" : "bg-elevated text-muted"}`}
                  >
                    {trip.title}
                  </button>
                ))}
              </section>
            )}
            {needNow.length > 0 && (
              <section className="mt-5">
                <p className="eyebrow mb-3">Need now</p>
                <div className="flex snap-x gap-3 overflow-x-auto pb-2">
                  {needNow.map((item) => (
                    <Link
                      key={item.id}
                      to={item.target}
                      className="surface-card min-w-[16rem] max-w-[19rem] snap-start p-4 transition-transform duration-200 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-brand-soft text-brand">
                        <FileCheck2 className="size-4" />
                      </span>
                      <p className="mt-4 whitespace-normal break-words text-sm font-black leading-5 [overflow-wrap:anywhere]">
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-muted">{item.detail}</p>
                    </Link>
                  ))}
                </div>
              </section>
            )}
            <section className="mt-5 grid gap-4 md:grid-cols-2">
              <section className="surface-card page-enter group relative p-5 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft motion-reduce:hover:translate-y-0">
                <button
                  type="button"
                  onClick={() => setShowingExpenses(true)}
                  className="absolute inset-0 z-10 rounded-[inherit] text-left outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label="Open trip expenses"
                />
                <p className="eyebrow">Trip expenses</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <CompactCostTotal costs={costsQuery.data ?? []} emptyText="No costs added yet" />
                  <ArrowRight className="size-4 shrink-0 text-brand transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </div>
                <p className="mt-2 text-xs text-muted">
                  Open the itemized costs, payers, participants, and balances.
                </p>
                <Link
                  to={`/trips/${focusedTrip.id}?add=cost`}
                  className="relative z-20 mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-brand"
                >
                  <Plus className="size-4" /> Add cost
                </Link>
              </section>
              <section className="surface-card page-enter group relative p-5 transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-soft motion-reduce:hover:translate-y-0">
                <Link
                  to={`/trips/${focusedTrip.id}/readiness`}
                  className="absolute inset-0 z-10 rounded-[inherit] focus-visible:ring-2 focus-visible:ring-brand"
                  aria-label="Open trip readiness"
                />
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted">
                  <Sparkles className="size-4" /> Readiness checklist
                </div>
                <p className="mt-3 font-display text-xl font-black">
                  {(requirementsQuery.data?.filter(
                    (item) => !["complete", "not_required"].includes(item.status)
                  ).length ?? 0) > 0
                    ? `${requirementsQuery.data?.filter((item) => !["complete", "not_required"].includes(item.status)).length} task${requirementsQuery.data?.filter((item) => !["complete", "not_required"].includes(item.status)).length === 1 ? "" : "s"} left`
                    : (requirementsQuery.data?.length ?? 0) > 0
                      ? "Everything is done"
                      : "Add your first task"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {requirementsQuery.data?.find(
                    (item) => !["complete", "not_required"].includes(item.status)
                  )
                    ? `Next: ${requirementsQuery.data.find((item) => !["complete", "not_required"].includes(item.status))?.title}`
                    : (requirementsQuery.data?.length ?? 0) > 0
                      ? "Every item on your checklist is complete."
                      : "Keep a simple list of what needs to be done before you leave."}
                </p>
                <Link
                  to={`/trips/${focusedTrip.id}/readiness`}
                  className="relative z-20 mt-3 inline-flex items-center gap-2 text-sm font-extrabold text-brand"
                >
                  Open checklist{" "}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </Link>
              </section>
            </section>
            {trips.length > 1 && (
              <section className="mt-10">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-display text-xl font-black">Other trips</h2>
                  <Link className="text-sm font-bold text-brand" to="/trips">
                    See all
                  </Link>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {trips.slice(1, 3).map((trip) => (
                    <TripCard key={trip.id} trip={trip} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {focusedTrip && showingExpenses && (
        <TripExpensesSheet
          costs={costsQuery.data ?? []}
          balances={balances}
          travelers={travelersQuery.data ?? []}
          onClose={() => {
            setShowingExpenses(false);
            setViewingCost(null);
          }}
          onViewCost={(cost) => {
            setShowingExpenses(false);
            setViewingCost(cost);
          }}
        />
      )}
      {focusedTrip && viewingCost && (
        <CostDetailsSheet
          cost={viewingCost}
          expenseSplittingEnabled={Boolean(focusedTrip.expense_splitting_enabled)}
          flights={flightsQuery.data ?? []}
          travelers={travelersQuery.data ?? []}
          itinerary={itineraryQuery.data ?? []}
          bookings={bookingsQuery.data ?? []}
          editable={false}
          onNavigate={() => {
            setViewingCost(null);
            setShowingExpenses(false);
          }}
          onClose={() => {
            setViewingCost(null);
            setShowingExpenses(true);
          }}
          onEdit={() => undefined}
          onArchive={() => undefined}
        />
      )}
    </AppShell>
  );
}
