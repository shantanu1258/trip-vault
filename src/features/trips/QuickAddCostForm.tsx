import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { ModalSheet } from "../../components/ModalSheet";
import { RequiredMark } from "../../components/RequiredMark";
import type { Traveler } from "../workspace/types";
import { addTripCost } from "./api";
import { CostEventConnectionFields, useCostEventConnection } from "./CostEventConnectionFields";
import { getErrorMessage } from "./presentation";
import {
  costCategories,
  type CostCategory,
  type CreateCostInput,
  type Trip,
  type TripCost
} from "./types";
import { amountStringToMinor } from "./validation";

function categoryLabel(category: CostCategory) {
  return category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ");
}

export function QuickAddCostForm({
  trip,
  travelers,
  onClose,
  onSaved,
  connectionInitiallyOpen = false
}: {
  trip: Trip;
  travelers: Traveler[];
  onClose: () => void;
  onSaved?: (cost: TripCost) => void;
  connectionInitiallyOpen?: boolean;
}) {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [connectionOpen, setConnectionOpen] = useState(connectionInitiallyOpen);
  const eventConnection = useCostEventConnection({ tripId: trip.id, enabled: true });
  const mutation = useMutation({
    mutationFn: async (input: CreateCostInput) =>
      addTripCost({
        ...input,
        ...(await eventConnection.resolveConnection(input.title))
      }),
    onSuccess: async (cost) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["costs", trip.id] }),
        queryClient.invalidateQueries({ queryKey: ["home-costs", trip.id] })
      ]);
      onSaved?.(cost);
      onClose();
    }
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage("");
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") ?? "").trim();
    const amount = String(form.get("amount") ?? "").trim();
    const category = String(form.get("category") ?? "other") as CostCategory;
    if (!title) {
      setMessage("Say what this cost was for.");
      return;
    }
    if (!/^\d+(?:\.\d+)?$/.test(amount) || Number(amount) <= 0) {
      setMessage("Enter a cost greater than zero.");
      return;
    }
    if (!costCategories.includes(category)) {
      setMessage("Choose a valid cost category.");
      return;
    }
    mutation.mutate({
      tripId: trip.id,
      title,
      category,
      amountMinor: amountStringToMinor(amount, trip.base_currency),
      currencyCode: trip.base_currency,
      paymentStatus: "paid",
      participantTravelerIds: travelers.map((traveler) => traveler.id),
      ...eventConnection.connection
    });
  };

  return (
    <ModalSheet
      eyebrow={trip.title}
      title="Add cost"
      onClose={() => {
        if (!mutation.isPending) onClose();
      }}
    >
      <form className="mt-3 space-y-3" onSubmit={submit}>
        <input
          className="form-input"
          name="title"
          aria-label="What was it for?"
          placeholder="Stuff…"
          autoComplete="off"
        />
        <div className="grid gap-3 min-[360px]:grid-cols-[minmax(0,1fr)_minmax(8.5rem,0.8fr)]">
          <label className="form-label min-w-0">
            Amount
            <RequiredMark />
            <div className="form-input flex items-center gap-2">
              <span className="shrink-0 text-xs font-black text-muted">{trip.base_currency}</span>
              <input
                className="min-w-0 flex-1 bg-transparent outline-none"
                name="amount"
                inputMode="decimal"
                aria-label="Amount"
                placeholder="0.00"
              />
            </div>
          </label>
          <label className="form-label min-w-0">
            Category
            <select className="form-input" name="category" defaultValue="other">
              {costCategories.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <details
          className="group !p-0 rounded-lg border border-line/70 bg-surface-alt/30"
          open={connectionOpen}
          onToggle={(event) => setConnectionOpen(event.currentTarget.open)}
        >
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-3 px-3 py-1.5 text-xs font-bold text-muted [&::-webkit-details-marker]:hidden">
            <span>Connection (optional)</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <div className="space-y-3 border-t border-line bg-surface p-3">
            <CostEventConnectionFields
              value={eventConnection}
              eventLabel="Event"
              emptyLabel="General trip cost"
            />
          </div>
        </details>
        {(message || mutation.error) && (
          <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm font-bold text-danger">
            {message || getErrorMessage(mutation.error)}
          </p>
        )}
        <button type="submit" className="primary-button w-full" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Save cost
        </button>
      </form>
    </ModalSheet>
  );
}
