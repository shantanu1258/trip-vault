import type { TripCost } from "./types";

export type TravelerBalance = {
  travelerId: string;
  currencyCode: string;
  amountMinor: number;
};

/** Splits integer minor units deterministically so no fractional penny is lost. */
export function splitExpenseEqually(amountMinor: number, travelerIds: string[]) {
  const ids = [...new Set(travelerIds)].sort();
  if (!ids.length) return new Map<string, number>();
  const base = Math.floor(amountMinor / ids.length);
  const remainder = amountMinor % ids.length;
  return new Map(ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]));
}

export function calculateTripBalances(costs: TripCost[]): TravelerBalance[] {
  const totals = new Map<string, number>();
  const add = (travelerId: string, currencyCode: string, amount: number) => {
    const key = `${currencyCode}:${travelerId}`;
    totals.set(key, (totals.get(key) ?? 0) + amount);
  };

  for (const cost of costs) {
    if (cost.payment_status !== "paid" || !cost.paid_by_traveler_id) continue;
    const participants = cost.participants ?? [];
    const explicit = participants.every((participant) => participant.share_amount_minor !== null);
    const shares = explicit
      ? new Map(participants.map((participant) => [participant.traveler_id, participant.share_amount_minor ?? 0]))
      : splitExpenseEqually(cost.amount_minor, participants.map((participant) => participant.traveler_id));
    add(cost.paid_by_traveler_id, cost.currency_code, cost.amount_minor);
    for (const [travelerId, share] of shares) add(travelerId, cost.currency_code, -share);
  }

  return [...totals.entries()]
    .map(([key, amountMinor]) => {
      const separator = key.indexOf(":");
      return { currencyCode: key.slice(0, separator), travelerId: key.slice(separator + 1), amountMinor };
    })
    .filter((balance) => balance.amountMinor !== 0)
    .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode) || left.travelerId.localeCompare(right.travelerId));
}
