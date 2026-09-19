import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { listIncomingTripOffers, respondToTripOffer } from "../workspace/api";

export function TripInvitations() {
  const queryClient = useQueryClient();
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

  return (
    <>
      {offersQuery.error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          Trip invitations could not be loaded. Please try again when online.
        </p>
      )}
      {(offersQuery.data?.length ?? 0) > 0 && (
        <section className="mt-5 rounded-3xl border border-brand/25 bg-brand-soft p-5 sm:p-6">
          <p className="eyebrow">Trip invitations</p>
          <h2 className="mt-2 font-display text-2xl font-black">Someone you know shared a trip</h2>
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
    </>
  );
}
