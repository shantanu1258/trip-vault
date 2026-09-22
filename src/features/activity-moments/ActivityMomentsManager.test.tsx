import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, TripCost } from "../trips/types";
import type { ActivityMoment } from "./types";

const mocks = vi.hoisted(() => ({
  addActivityMoment: vi.fn(),
  archiveActivityMoment: vi.fn(),
  listActivityMoments: vi.fn(),
  reorderActivityMoments: vi.fn(),
  updateActivityMoment: vi.fn(),
  addTripCost: vi.fn(),
  confirm: vi.fn()
}));

vi.mock("../../components/ConfirmDialogProvider", () => ({
  useConfirmDialog: () => mocks.confirm
}));
vi.mock("./api", () => ({
  addActivityMoment: mocks.addActivityMoment,
  archiveActivityMoment: mocks.archiveActivityMoment,
  listActivityMoments: mocks.listActivityMoments,
  reorderActivityMoments: mocks.reorderActivityMoments,
  updateActivityMoment: mocks.updateActivityMoment
}));
vi.mock("../trips/api", () => ({
  addTripCost: mocks.addTripCost
}));

import { ActivityMomentsManager } from "./ActivityMomentsManager";

const activity: ItineraryItem = {
  id: "activity-1",
  trip_id: "trip-1",
  title: "Old Delhi afternoon",
  event_type: "activity",
  event_status: "planned",
  starts_at: "2026-09-28T06:30:00.000Z",
  ends_at: "2026-09-28T10:30:00.000Z",
  timezone: "Asia/Kolkata",
  location: null,
  notes: null,
  applies_to_all_travelers: true,
  booking_id: null,
  duration_minutes: 240,
  sort_key: "100",
  has_explicit_start_time: true,
  timing_mode: "exact",
  anchor_itinerary_item_id: null,
  relative_position: null,
  created_at: "2026-09-20T00:00:00.000Z"
};

function moment(id: string, order: number, title: string): ActivityMoment {
  return {
    id,
    itinerary_item_id: activity.id,
    moment_order: order,
    title,
    location: null,
    starts_at: null,
    ends_at: null,
    timezone: activity.timezone,
    notes: null,
    source_planning_item_id: null,
    version: 1,
    created_at: "2026-09-20T00:00:00.000Z",
    updated_at: "2026-09-20T00:00:00.000Z"
  };
}

function renderManager(costs: TripCost[] = []) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={client}>
      <ActivityMomentsManager
        tripId="trip-1"
        item={activity}
        costs={costs}
        currencyCode="INR"
        participantTravelerIds={["traveler-1"]}
        editable
      />
    </QueryClientProvider>
  );
  return user;
}

describe("ActivityMomentsManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listActivityMoments.mockResolvedValue([]);
    mocks.addActivityMoment.mockResolvedValue(moment("moment-1", 100, "Spice market"));
    mocks.addTripCost.mockResolvedValue({ id: "cost-1" });
  });

  it("keeps Moments as compact ordered activity details with their costs", async () => {
    mocks.listActivityMoments.mockResolvedValue([
      moment("moment-1", 100, "Spice market"),
      moment("moment-2", 200, "Street-food lunch")
    ]);
    const costs: TripCost[] = [
      {
        id: "cost-1",
        trip_id: "trip-1",
        booking_id: null,
        itinerary_item_id: activity.id,
        activity_moment_id: "moment-2",
        title: "Street-food lunch cost",
        category: "activity",
        amount_minor: 85000,
        currency_code: "INR",
        payment_status: "planned",
        notes: null,
        created_at: "2026-09-20T00:00:00.000Z"
      }
    ];

    renderManager(costs);

    const lunch = await screen.findByRole("listitem", {
      name: "Moment 2: Street-food lunch"
    });
    expect(within(lunch).getByText(/850\.00/)).toBeVisible();
    expect(
      within(lunch).getByRole("button", { name: "Move Street-food lunch earlier" })
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add Moment" })).toBeVisible();
  });

  it("adds a Moment and can attach its optional cost to the parent activity", async () => {
    const user = renderManager();
    await screen.findByText(/No Moments yet/i);
    await user.click(screen.getByRole("button", { name: "Add Moment" }));
    await user.type(screen.getByLabelText(/Moment name/), "Spice market");
    await user.type(screen.getByRole("textbox", { name: "Moment cost (optional)" }), "850");
    expect(screen.getByLabelText("Place")).not.toBeVisible();
    const moreDetails = screen.getByText("More details");
    expect(moreDetails.closest("details")).toHaveClass("!p-0");
    await user.click(moreDetails);
    await user.type(screen.getByLabelText("Place"), "Khari Baoli");
    await user.selectOptions(screen.getByLabelText("Payment"), "paid");
    await user.click(screen.getByRole("button", { name: "Add Moment" }));

    await waitFor(() =>
      expect(mocks.addActivityMoment).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: "trip-1",
          itineraryItemId: activity.id,
          title: "Spice market",
          location: "Khari Baoli",
          timezone: "Asia/Kolkata"
        })
      )
    );
    expect(mocks.addTripCost).toHaveBeenCalledWith({
      tripId: "trip-1",
      itineraryItemId: activity.id,
      activityMomentId: "moment-1",
      title: "Spice market cost",
      category: "activity",
      amountMinor: 85000,
      currencyCode: "INR",
      paymentStatus: "paid",
      participantTravelerIds: ["traveler-1"]
    });
  });

  it("does not save a Moment when its optional cost is invalid, then saves once after correction", async () => {
    const user = renderManager();
    await screen.findByText(/No Moments yet/i);
    await user.click(screen.getByRole("button", { name: "Add Moment" }));
    await user.type(screen.getByLabelText(/Moment name/), "Spice market");
    const amount = screen.getByRole("textbox", { name: "Moment cost (optional)" });
    await user.type(amount, "invalid");
    await user.click(screen.getByRole("button", { name: "Add Moment" }));
    expect(await screen.findByText("Enter a Moment cost greater than zero.")).toBeVisible();
    expect(mocks.addActivityMoment).not.toHaveBeenCalled();
    expect(mocks.addTripCost).not.toHaveBeenCalled();
    await user.clear(amount);
    await user.type(amount, "850");
    await user.click(screen.getByRole("button", { name: "Add Moment" }));
    await waitFor(() => expect(mocks.addTripCost).toHaveBeenCalledOnce());
    expect(mocks.addActivityMoment).toHaveBeenCalledOnce();
  });
});
