import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialogProvider";
import { tripQueries } from "../queries/tripQueries";
import { archiveTripCost } from "../trips/api";
import { AddCostForm } from "../trips/TripForms";
import { CostDetailsSheet } from "../trips/TripExpenses";
import { formatMoney, getErrorMessage, groupCostTotals } from "../trips/presentation";
import type { ItineraryItem, Trip, TripCost } from "../trips/types";
import { BookingDisclosure } from "./BookingDetailSections";
import type { Booking, Traveler } from "./types";

export function costsForBooking(bookingId: string, itinerary: ItineraryItem[], costs: TripCost[]) {
  const eventIds = new Set(
    itinerary.filter((item) => item.booking_id === bookingId).map((item) => item.id)
  );
  return costs.filter(
    (cost) =>
      cost.booking_id === bookingId ||
      Boolean(cost.itinerary_item_id && eventIds.has(cost.itinerary_item_id))
  );
}

export function BookingCosts({
  trip,
  booking,
  travelers,
  editable
}: {
  trip: Trip;
  booking: Booking;
  travelers: Traveler[];
  editable: boolean;
}) {
  const costsQuery = useQuery(tripQueries.costs(trip.id));
  const itineraryQuery = useQuery(tripQueries.itinerary(trip.id));
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const [viewing, setViewing] = useState<TripCost | null>(null);
  const [editing, setEditing] = useState<TripCost | "new" | null>(null);
  const archive = useMutation({
    mutationFn: archiveTripCost,
    onSuccess: async () => {
      setViewing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["costs", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["home-costs", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["archived-trip-items", trip.id] })
      ]);
    }
  });
  const costs = costsForBooking(booking.id, itineraryQuery.data ?? [], costsQuery.data ?? []);
  const loading = costsQuery.isLoading || itineraryQuery.isLoading;
  const error = costsQuery.error || itineraryQuery.error;
  const totals = Object.entries(groupCostTotals(costs))
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(" · ");

  return (
    <>
      <BookingDisclosure
        title="Costs"
        compact
        hint={
          loading
            ? "Loading costs…"
            : error
              ? "Costs unavailable"
              : costs.length
                ? totals || "No active cost"
                : "No costs added"
        }
      >
        {error ? (
          <p role="alert" className="text-sm text-danger">
            Could not load costs.{" "}
            <button
              className="underline"
              onClick={() => {
                void costsQuery.refetch();
                void itineraryQuery.refetch();
              }}
            >
              Retry
            </button>
          </p>
        ) : (
          !loading && (
            <div className="divide-y divide-line">
              {costs.map((cost) => (
                <button
                  key={cost.id}
                  type="button"
                  onClick={() => setViewing(cost)}
                  className="flex min-h-11 w-full items-center gap-2 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <strong className="block break-words text-sm">{cost.title}</strong>
                    <span className="text-xs capitalize text-muted">{cost.payment_status}</span>
                  </span>
                  <span className="text-right text-sm font-bold">
                    {cost.amount_minor === 0
                      ? "Free"
                      : formatMoney(cost.amount_minor, cost.currency_code)}
                  </span>
                  <ChevronRight className="size-4 shrink-0" />
                </button>
              ))}
            </div>
          )
        )}
        {editable && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-xs font-bold text-brand hover:bg-elevated"
            onClick={() => setEditing("new")}
          >
            <Plus className="size-4" /> Add cost
          </button>
        )}
        {archive.error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {getErrorMessage(archive.error)}
          </p>
        )}
      </BookingDisclosure>
      {viewing && (
        <CostDetailsSheet
          expenseSplittingEnabled={Boolean(trip.expense_splitting_enabled)}
          cost={viewing}
          travelers={travelers}
          itinerary={itineraryQuery.data ?? []}
          bookings={[booking]}
          editable={editable && !archive.isPending}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setEditing(viewing);
            setViewing(null);
          }}
          onArchive={async () => {
            if (!editable || archive.isPending) return;
            if (
              await confirm({
                title: "Archive cost?",
                message: `Archive ${viewing.title}? You can restore it from Archived trip items.`,
                confirmLabel: "Archive",
                tone: "danger"
              })
            )
              archive.mutate(viewing);
          }}
        />
      )}
      {editing && editable && (
        <AddCostForm
          trip={trip}
          travelers={travelers}
          cost={editing === "new" ? undefined : editing}
          bookingId={booking.id}
          sourceTitle={booking.title}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
