import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingCosts, costsForBooking } from "./BookingCosts";
import { formatMoney } from "../trips/presentation";
import type { Trip, TripCost, ItineraryItem } from "../trips/types";
import type { Booking } from "./types";

const mocks = vi.hoisted(() => ({ listCosts: vi.fn(), listItinerary: vi.fn() }));
vi.mock("../trips/api", () => ({ ...mocks, archiveTripCost: vi.fn() }));
vi.mock("../trips/TripForms", () => ({
  AddCostForm: ({ bookingId, cost }: { bookingId: string; cost?: TripCost }) => (
    <div
      role="dialog"
      aria-label="Cost editor"
      data-booking-id={bookingId}
      data-cost-id={cost?.id}
    />
  )
}));
vi.mock("../trips/TripExpenses", () => ({
  CostDetailsSheet: ({
    cost,
    editable,
    onEdit
  }: {
    cost: TripCost;
    editable: boolean;
    onEdit: () => void;
  }) => (
    <section aria-label="Cost details">
      {cost.title}
      {editable && <button onClick={onEdit}>Edit expense</button>}
    </section>
  )
}));

const booking = { id: "stay", title: "Hotel stay" } as Booking;
const trip = { id: "trip" } as Trip;
const itinerary = [
  { id: "checkin", booking_id: "stay" },
  { id: "checkout", booking_id: "stay" },
  { id: "flight", booking_id: "flight" }
] as ItineraryItem[];
const cost = (id: string, overrides: Partial<TripCost> = {}): TripCost => ({
  id,
  trip_id: "trip",
  title: id,
  booking_id: "stay",
  itinerary_item_id: null,
  category: "hotel",
  amount_minor: 10000,
  currency_code: "INR",
  payment_status: "paid",
  notes: null,
  created_at: "2026-09-19",
  ...overrides
});
function setup(editable = true) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <BookingCosts trip={trip} booking={booking} travelers={[]} editable={editable} />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  mocks.listCosts.mockResolvedValue([]);
  mocks.listItinerary.mockResolvedValue(itinerary);
});

describe("booking costs", () => {
  it("includes direct and linked-event costs once, including checkout, but no unrelated costs", () => {
    const costs = [
      cost("stay", { itinerary_item_id: "checkin" }),
      cost("late checkout", { booking_id: null, itinerary_item_id: "checkout" }),
      cost("flight", { booking_id: "flight", itinerary_item_id: "flight" })
    ];
    expect(costsForBooking("stay", itinerary, costs).map((item) => item.id)).toEqual([
      "stay",
      "late checkout"
    ]);
  });
  it("separates currencies, excludes refunded amounts from totals, and edits existing costs", async () => {
    mocks.listCosts.mockResolvedValue([
      cost("Room charge"),
      cost("Deposit", { currency_code: "SGD", amount_minor: 5000 }),
      cost("Refund", { payment_status: "refunded", amount_minor: 20000 })
    ]);
    setup();
    await waitFor(() =>
      expect(
        screen.getByText(
          (_text, element) =>
            element?.tagName === "SPAN" &&
            element.textContent === `${formatMoney(10000, "INR")} · ${formatMoney(5000, "SGD")}`
        )
      ).toBeInTheDocument()
    );
    expect(screen.getByText("Costs").closest("details")).not.toHaveAttribute("open");
    await userEvent.click(screen.getByText("Costs"));
    await userEvent.click(screen.getByRole("button", { name: /Room charge/ }));
    await userEvent.click(screen.getByRole("button", { name: "Edit expense" }));
    expect(screen.getByRole("dialog", { name: "Cost editor" })).toHaveAttribute(
      "data-cost-id",
      "Room charge"
    );
  });
  it("attaches new costs to the booking", async () => {
    setup();
    await screen.findByText("No costs added");
    await userEvent.click(screen.getByText("Costs"));
    await userEvent.click(screen.getByRole("button", { name: "Add cost" }));
    expect(screen.getByRole("dialog", { name: "Cost editor" })).toHaveAttribute(
      "data-booking-id",
      "stay"
    );
  });
  it("keeps viewer costs read-only", async () => {
    mocks.listCosts.mockResolvedValue([cost("Room charge")]);
    setup(false);
    await screen.findByText("Room charge");
    await userEvent.click(screen.getByText("Costs"));
    await userEvent.click(await screen.findByRole("button", { name: /Room charge/ }));
    expect(screen.queryByRole("button", { name: "Add cost" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit expense" })).not.toBeInTheDocument();
  });
  it("does not present failed queries as zero costs", async () => {
    mocks.listCosts.mockRejectedValue(new Error("Offline"));
    setup();
    await screen.findByText("Costs unavailable");
    await userEvent.click(screen.getByText("Costs"));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load costs");
  });
});
