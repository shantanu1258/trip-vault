import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { useConfirmDialog } from "../components/ConfirmDialogProvider";
import { ErrorCard, LoadingCard } from "../components/TripUi";
import { tripQueries } from "../features/queries/tripQueries";
import { localProfileId } from "../features/sync/localSync";
import { archiveTripCost, updateTripExpenseSplitting } from "../features/trips/api";
import { calculateTripBalances } from "../features/trips/expenses";
import { tripReturnNavigation } from "../features/trips/navigation";
import { getErrorMessage } from "../features/trips/presentation";
import { useTripReturnScroll } from "../features/trips/returnScroll";
import { AddCostForm } from "../features/trips/TripForms";
import { CostDetailsSheet, TripExpensesContent } from "../features/trips/TripExpenses";
import { QuickAddCostForm } from "../features/trips/QuickAddCostForm";
import {
  costCategories,
  type CostCategory,
  type Trip,
  type TripCost
} from "../features/trips/types";
import { readTravelerFocus } from "../features/workspace/travelerFocus";

function categoryLabel(category: CostCategory) {
  return category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ");
}

export function TripExpensesPage() {
  const { tripId = "" } = useParams();
  const location = useLocation();
  const confirm = useConfirmDialog();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [addingCost, setAddingCost] = useState(false);
  const [viewingCost, setViewingCost] = useState<TripCost | null>(null);
  const [editingCost, setEditingCost] = useState<TripCost | null>(null);
  const [message, setMessage] = useState("");
  const search = searchParams.get("search") ?? "";
  const categoryParam = searchParams.get("category");
  const category = costCategories.includes(categoryParam as CostCategory)
    ? (categoryParam as CostCategory)
    : "all";
  const travelerId = searchParams.get("traveler") ?? readTravelerFocus(tripId) ?? "all";
  const setListParam = (key: string, value: string, defaultValue = "") =>
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (!value || value === defaultValue) next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true, state: location.state }
    );

  const tripQuery = useQuery({ ...tripQueries.trip(tripId), enabled: Boolean(tripId) });
  const costsQuery = useQuery({ ...tripQueries.costs(tripId), enabled: Boolean(tripId) });
  const itineraryQuery = useQuery({ ...tripQueries.itinerary(tripId), enabled: Boolean(tripId) });
  const bookingsQuery = useQuery({ ...tripQueries.bookings(tripId), enabled: Boolean(tripId) });
  const flightsQuery = useQuery({
    ...tripQueries.flights(tripId, bookingsQuery.data),
    enabled: Boolean(tripId) && bookingsQuery.isSuccess
  });
  const travelersQuery = useQuery({ ...tripQueries.travelers(tripId), enabled: Boolean(tripId) });
  const membersQuery = useQuery({ ...tripQueries.members(tripId), enabled: Boolean(tripId) });
  const profileQuery = useQuery({
    queryKey: ["local-profile-id"],
    queryFn: localProfileId
  });
  const trip = tripQuery.data;
  const costs = costsQuery.data ?? [];
  const travelers = travelersQuery.data ?? [];
  const member = (membersQuery.data ?? []).find((item) => item.user_id === profileQuery.data);
  const editable = member?.role === "owner" || member?.role === "editor";
  const balances = useMemo(() => calculateTripBalances(costs), [costs]);
  const visibleCosts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return costs
      .filter((cost) => {
        const travelerMatches =
          travelerId === "all" ||
          cost.paid_by_traveler_id === travelerId ||
          (cost.participants ?? []).some((participant) => participant.traveler_id === travelerId);
        const searchText = [
          cost.title,
          categoryLabel(cost.category),
          cost.payment_status.replaceAll("_", " "),
          travelers.find((traveler) => traveler.id === cost.paid_by_traveler_id)?.display_name ?? ""
        ]
          .join(" ")
          .toLowerCase();
        return (
          (category === "all" || cost.category === category) &&
          travelerMatches &&
          (!normalized || searchText.includes(normalized))
        );
      })
      .sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime() ||
          left.title.localeCompare(right.title)
      );
  }, [category, costs, search, travelerId, travelers]);
  const filteredTotalLabel = useMemo(() => {
    const labels: string[] = [];
    if (category !== "all") labels.push(categoryLabel(category));
    if (travelerId !== "all") {
      labels.push(
        travelers.find((traveler) => traveler.id === travelerId)?.display_name ?? "Traveler"
      );
    }
    if (search.trim()) labels.push("Search");
    return labels.length ? `${labels.join(" · ")} total` : undefined;
  }, [category, search, travelerId, travelers]);
  const categoryCounts = useMemo(
    () =>
      costCategories.map((item) => ({
        category: item,
        count: costs.filter((cost) => cost.category === item).length
      })),
    [costs]
  );
  const returnNavigation = tripReturnNavigation(location.state, tripId);
  useTripReturnScroll(
    tripId,
    tripQuery.isSuccess &&
      costsQuery.isSuccess &&
      !itineraryQuery.isLoading &&
      !bookingsQuery.isLoading &&
      !flightsQuery.isLoading &&
      !travelersQuery.isLoading &&
      !membersQuery.isLoading &&
      !profileQuery.isLoading
  );

  const archiveCost = useMutation({
    mutationFn: archiveTripCost,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["costs", tripId] }),
        queryClient.invalidateQueries({ queryKey: ["archived-trip-items", tripId] })
      ]);
      setMessage("Cost archived.");
    }
  });
  const updateExpenseSplitting = useMutation({
    mutationFn: ({ currentTrip, enabled }: { currentTrip: Trip; enabled: boolean }) =>
      updateTripExpenseSplitting(currentTrip, enabled),
    onSuccess: (updated) => {
      queryClient.setQueryData(["trip", tripId], updated);
      queryClient.setQueryData<Trip[]>(["trips"], (items) =>
        items?.map((item) => (item.id === updated.id ? updated : item))
      );
    }
  });

  return (
    <AppShell compactTop>
      <div className="mx-auto min-w-0 max-w-5xl pb-24">
        <header className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-2 py-1">
          <Link
            replace
            to={returnNavigation.href}
            state={returnNavigation.state}
            className="tap-target grid place-items-center rounded-xl text-muted hover:bg-elevated hover:text-ink"
            aria-label="Back to trip details"
          >
            <ArrowLeft className="size-5" aria-hidden="true" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold leading-tight sm:text-2xl">Expenses</h1>
            <p className="mt-0.5 truncate text-xs text-muted" title={trip?.title}>
              {trip?.title ?? "Trip"}
            </p>
          </div>
          {editable && (
            <button
              type="button"
              className="tap-target inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-extrabold text-surface"
              onClick={() => setAddingCost(true)}
            >
              <Plus className="size-4" aria-hidden="true" /> Add cost
            </button>
          )}
        </header>

        {(tripQuery.isLoading || costsQuery.isLoading) && <LoadingCard />}
        {(tripQuery.error || costsQuery.error) && (
          <ErrorCard error={tripQuery.error ?? costsQuery.error} />
        )}
        {message && (
          <p
            role="status"
            className="mt-3 rounded-xl bg-success/10 p-3 text-sm font-bold text-success"
          >
            {message}
          </p>
        )}
        {trip && costsQuery.data && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_11rem_12rem]">
              <label className="relative col-span-2 sm:col-span-1">
                <span className="sr-only">Search trip expenses</span>
                <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input
                  className="form-input mt-0 pl-10"
                  value={search}
                  onChange={(event) => setListParam("search", event.target.value)}
                  placeholder="Search expenses"
                />
              </label>
              <select
                className="form-input mt-0"
                aria-label="Filter expenses by category"
                value={category}
                onChange={(event) => setListParam("category", event.target.value, "all")}
              >
                <option value="all">All types ({costs.length})</option>
                {categoryCounts
                  .filter((item) => item.count > 0 || item.category === category)
                  .map((item) => (
                    <option key={item.category} value={item.category}>
                      {categoryLabel(item.category)} ({item.count})
                    </option>
                  ))}
              </select>
              <select
                className="form-input mt-0"
                aria-label="Filter expenses by traveler"
                value={travelerId}
                onChange={(event) => setListParam("traveler", event.target.value, "all")}
              >
                <option value="all">All travelers</option>
                {travelers.map((traveler) => (
                  <option key={traveler.id} value={traveler.id}>
                    {traveler.display_name}
                  </option>
                ))}
              </select>
            </div>

            <section className="mt-5">
              <TripExpensesContent
                costs={costs}
                itemizedCosts={visibleCosts}
                filteredCosts={filteredTotalLabel ? visibleCosts : undefined}
                filteredLabel={filteredTotalLabel}
                balances={balances}
                travelers={travelers}
                onViewCost={setViewingCost}
                emptyText="No expenses match these filters."
                expenseSplittingControl={
                  editable ? (
                    <>
                      <label className="flex min-h-12 cursor-pointer items-center justify-between gap-3 p-3 text-sm">
                        <strong>Enable expense splitting</strong>
                        {updateExpenseSplitting.isPending ? (
                          <Loader2
                            role="status"
                            aria-label="Saving expense splitting setting"
                            className="size-5 shrink-0 animate-spin text-brand"
                          />
                        ) : (
                          <input
                            type="checkbox"
                            className="size-5 shrink-0 accent-brand"
                            checked={Boolean(trip.expense_splitting_enabled)}
                            onChange={(event) =>
                              updateExpenseSplitting.mutate({
                                currentTrip: trip,
                                enabled: event.target.checked
                              })
                            }
                          />
                        )}
                      </label>
                      {updateExpenseSplitting.error && (
                        <p
                          className="border-t border-line bg-danger/10 p-3 text-sm font-bold text-danger"
                          role="alert"
                        >
                          {getErrorMessage(updateExpenseSplitting.error)}
                        </p>
                      )}
                    </>
                  ) : undefined
                }
              />
            </section>
          </>
        )}
      </div>

      {trip && addingCost && editable && (
        <QuickAddCostForm
          trip={trip}
          travelers={travelers}
          connectionInitiallyOpen
          onClose={() => setAddingCost(false)}
          onSaved={() => setMessage("Cost added to trip expenses.")}
        />
      )}
      {trip && viewingCost && (
        <CostDetailsSheet
          cost={viewingCost}
          expenseSplittingEnabled={Boolean(trip.expense_splitting_enabled)}
          flights={flightsQuery.data ?? []}
          travelers={travelers}
          itinerary={itineraryQuery.data ?? []}
          bookings={bookingsQuery.data ?? []}
          editable={editable}
          onClose={() => setViewingCost(null)}
          onNavigate={() => setViewingCost(null)}
          onEdit={() => {
            setEditingCost(viewingCost);
            setViewingCost(null);
          }}
          onArchive={async () => {
            if (
              await confirm({
                title: "Archive cost?",
                message: `Archive ${viewingCost.title}? You can restore it from Archived trip items.`,
                confirmLabel: "Archive",
                tone: "danger"
              })
            ) {
              await archiveCost.mutateAsync(viewingCost);
              setViewingCost(null);
            }
          }}
        />
      )}
      {trip && editingCost && editable && (
        <AddCostForm
          trip={trip}
          travelers={travelers}
          cost={editingCost}
          onClose={() => setEditingCost(null)}
        />
      )}
    </AppShell>
  );
}
