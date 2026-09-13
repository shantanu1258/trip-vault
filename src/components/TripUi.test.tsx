import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TripCost } from "../features/trips/types";
import { CompactCostTotal } from "./TripUi";

function cost(id: string, amountMinor: number, currencyCode: string, paymentStatus: TripCost["payment_status"] = "paid"): TripCost {
  return { id, trip_id: "trip", itinerary_item_id: null, title: id, category: "other", amount_minor: amountMinor, currency_code: currencyCode, payment_status: paymentStatus, notes: null, created_at: "" };
}

describe("compact trip cost", () => {
  it("shows grouped currency totals while excluding refunds", () => {
    render(<CompactCostTotal costs={[cost("hotel", 125_000, "INR"), cost("dinner", 2_500, "INR"), cost("refund", 10_000, "INR", "refunded")]} />);
    expect(screen.getByText("Total trip cost")).toBeInTheDocument();
    expect(screen.getByText("₹1,275.00")).toBeInTheDocument();
  });

  it("uses the supplied empty message", () => {
    render(<CompactCostTotal costs={[]} emptyText="Add your first trip cost" />);
    expect(screen.getByText("Add your first trip cost")).toBeInTheDocument();
  });
});
