import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { Trip, TripCost } from "../features/trips/types";
import { CompactCostTotal, TripCard } from "./TripUi";

function cost(
  id: string,
  amountMinor: number,
  currencyCode: string,
  paymentStatus: TripCost["payment_status"] = "paid"
): TripCost {
  return {
    id,
    trip_id: "trip",
    itinerary_item_id: null,
    title: id,
    category: "other",
    amount_minor: amountMinor,
    currency_code: currencyCode,
    payment_status: paymentStatus,
    notes: null,
    created_at: ""
  };
}

describe("compact trip cost", () => {
  it("shows grouped currency totals while excluding refunds", () => {
    render(
      <CompactCostTotal
        costs={[
          cost("hotel", 125_000, "INR"),
          cost("dinner", 2_500, "INR"),
          cost("refund", 10_000, "INR", "refunded")
        ]}
      />
    );
    expect(screen.getByText("Total trip cost")).toBeInTheDocument();
    expect(screen.getByText("₹1,275.00")).toBeInTheDocument();
  });

  it("uses the supplied empty message", () => {
    render(<CompactCostTotal costs={[]} emptyText="Add your first trip cost" />);
    expect(screen.getByText("Add your first trip cost")).toBeInTheDocument();
  });
});

describe("trip card navigation", () => {
  it("keeps the full trip name accessible on its details link", () => {
    const longTitle = `A very long trip name ${"withoutbreaks".repeat(12)}`;
    const trip: Trip = {
      id: "trip-long-name",
      title: longTitle,
      destination_summary: "Destination".repeat(24),
      start_date: "2026-10-01",
      end_date: "2026-10-18",
      primary_timezone: "Asia/Kolkata",
      base_currency: "INR",
      status: "upcoming",
      created_at: "2026-09-16T00:00:00Z",
      updated_at: "2026-09-16T00:00:00Z"
    };

    render(
      <MemoryRouter>
        <TripCard trip={trip} />
      </MemoryRouter>
    );

    const card = screen.getByRole("link", { name: new RegExp("A very long trip name") });
    const title = screen.getByRole("heading", { name: longTitle });
    expect(card).toHaveAttribute("href", "/trips/trip-long-name");
    expect(card).toContainElement(title);
  });
});
