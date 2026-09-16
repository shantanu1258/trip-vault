import { describe, expect, it } from "vitest";
import { calculateTripBalances, splitExpenseEqually } from "./expenses";
import type { TripCost } from "./types";

describe("trip expenses", () => {
  it("keeps every minor unit when an equal split has a remainder", () => {
    expect([...splitExpenseEqually(100, ["c", "a", "b"])]).toEqual([
      ["a", 34],
      ["b", 33],
      ["c", 33]
    ]);
  });

  it("derives balances from paid expenses and never combines currencies", () => {
    const costs = [
      {
        id: "1",
        trip_id: "trip",
        itinerary_item_id: null,
        title: "Dinner",
        category: "food",
        amount_minor: 900,
        currency_code: "INR",
        payment_status: "paid",
        paid_by_traveler_id: "a",
        participants: [
          { traveler_id: "a", share_amount_minor: null },
          { traveler_id: "b", share_amount_minor: null },
          { traveler_id: "c", share_amount_minor: null }
        ],
        notes: null,
        created_at: ""
      },
      {
        id: "2",
        trip_id: "trip",
        itinerary_item_id: null,
        title: "Coffee",
        category: "food",
        amount_minor: 600,
        currency_code: "USD",
        payment_status: "paid",
        paid_by_traveler_id: "b",
        participants: [
          { traveler_id: "a", share_amount_minor: null },
          { traveler_id: "b", share_amount_minor: null }
        ],
        notes: null,
        created_at: ""
      }
    ] satisfies TripCost[];
    expect(calculateTripBalances(costs)).toEqual([
      { travelerId: "a", currencyCode: "INR", amountMinor: 600 },
      { travelerId: "b", currencyCode: "INR", amountMinor: -300 },
      { travelerId: "c", currencyCode: "INR", amountMinor: -300 },
      { travelerId: "a", currencyCode: "USD", amountMinor: -300 },
      { travelerId: "b", currencyCode: "USD", amountMinor: 300 }
    ]);
  });
});
