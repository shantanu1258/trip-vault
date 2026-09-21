import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem } from "../trips/types";
import {
  PlanningItemsCompactEditor,
  PlanningItemsManager,
  PlanningItemsSummary
} from "./PlanningItems";
import type { PlanningItem } from "./types";

const mocks = vi.hoisted(() => ({
  addPlanningItem: vi.fn(),
  archivePlanningItem: vi.fn(),
  createActivityFromPlanning: vi.fn(),
  createCabRouteFromPlanning: vi.fn(),
  listPlanningItems: vi.fn(),
  promotePlanningItem: vi.fn(),
  reorderPlanningItems: vi.fn(),
  unlinkPlanningItem: vi.fn(),
  updatePlanningItem: vi.fn()
}));

vi.mock("./api", () => mocks);

const planningEvent: ItineraryItem = {
  id: "plan-1",
  trip_id: "trip-1",
  title: "Saturday plan",
  event_type: "preparation",
  starts_at: "2026-10-03T06:30:00.000Z",
  ends_at: null,
  timezone: "Asia/Kolkata",
  location: null,
  notes: null,
  applies_to_all_travelers: true,
  timing_mode: "date_only",
  scheduled_date: "2026-10-03",
  has_explicit_start_time: false,
  created_at: "2026-09-21T10:00:00.000Z"
};

function item(id: string, itemOrder: number, title: string): PlanningItem {
  return {
    id,
    planning_event_id: planningEvent.id,
    item_order: itemOrder,
    kind: "place",
    title,
    location: { label: `${title} location` },
    starts_at: null,
    duration_minutes: null,
    timezone: planningEvent.timezone,
    notes: null,
    linked_itinerary_item_id: null,
    promoted_at: null
  };
}

const items = [item("item-1", 100, "Hotel"), item("item-2", 200, "Museum")];

function renderWithClient(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

function ControlledPlanningItems({
  initialFocusedItemId = null,
  ...props
}: Omit<ComponentProps<typeof PlanningItemsManager>, "focusedItemId" | "onFocusedItemChange"> & {
  initialFocusedItemId?: string | null;
}) {
  const [focusedItemId, setFocusedItemId] = useState<string | null>(initialFocusedItemId);
  return (
    <PlanningItemsManager
      {...props}
      focusedItemId={focusedItemId}
      onFocusedItemChange={setFocusedItemId}
    />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listPlanningItems.mockResolvedValue(items);
});

describe("PlanningItems", () => {
  it("renders the live linked event identity in the compact summary", async () => {
    mocks.listPlanningItems.mockResolvedValue([
      { ...items[0], linked_itinerary_item_id: "activity-1", promoted_at: "2026-09-21" }
    ]);
    const linkedEvent: ItineraryItem = {
      ...planningEvent,
      id: "activity-1",
      title: "Updated museum visit",
      event_type: "activity",
      location: { label: "New entrance" }
    };

    renderWithClient(
      <PlanningItemsSummary planningEventId={planningEvent.id} itinerary={[linkedEvent]} />
    );

    expect(await screen.findByText(/Updated museum visit/)).toBeInTheDocument();
    expect(screen.queryByText("New entrance")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Linked event")).toBeInTheDocument();
  });

  it("promotes an item and immediately opens the linked event", async () => {
    const user = userEvent.setup();
    const onOpenEvent = vi.fn();
    const created = { ...planningEvent, id: "activity-1", event_type: "activity" };
    mocks.promotePlanningItem.mockResolvedValue(created);
    renderWithClient(
      <ControlledPlanningItems
        tripId="trip-1"
        planningEvent={planningEvent}
        travelerIds={[]}
        itinerary={[planningEvent]}
        editable
        onOpenEvent={onOpenEvent}
      />
    );

    await user.click(await screen.findByRole("button", { name: "Open plan item Hotel" }));
    expect(screen.getByRole("option", { name: "Other transport" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Turn into event" }));
    const dialog = screen.getByRole("dialog", { name: "Create activity?" });
    expect(dialog).toHaveTextContent("What happens next");
    await user.click(within(dialog).getByRole("button", { name: "Create activity" }));

    await waitFor(() =>
      expect(mocks.promotePlanningItem).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: "trip-1", planningEvent }),
        items[0],
        "activity"
      )
    );
    await waitFor(() => expect(onOpenEvent).toHaveBeenCalledWith("activity-1"));
  });

  it("keeps modal controls compact and quick-adds a highlighted item", async () => {
    const user = userEvent.setup();
    const added = { ...item("item-3", 300, "Lunch"), kind: "meal" as const };
    mocks.listPlanningItems.mockResolvedValueOnce(items).mockResolvedValue([...items, added]);
    mocks.addPlanningItem.mockResolvedValue(added);

    renderWithClient(
      <MemoryRouter>
        <PlanningItemsCompactEditor
          planningEvent={planningEvent}
          itinerary={[planningEvent]}
          tripId="trip-1"
          detailsHref="/trips/trip-1/planning/plan-1"
          editable
        />
      </MemoryRouter>
    );

    const hotel = await screen.findByRole("listitem", { name: "Plan item 1: Hotel" });
    expect(
      within(hotel).getByRole("link", { name: "Open plan details for Hotel" })
    ).toHaveAttribute("href", "/trips/trip-1/planning/plan-1?item=item-1");
    expect(within(hotel).queryByRole("button", { name: "Edit Hotel" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add item" }));
    const quickAdd = screen.getByRole("form", { name: "Quick add plan item" });
    const name = within(quickAdd).getByLabelText("Name");
    await waitFor(() => expect(name).toHaveFocus());
    await user.selectOptions(within(quickAdd).getByLabelText("Type"), "meal");
    await user.type(name, "Lunch");
    await user.click(within(quickAdd).getByRole("button", { name: "Add to plan" }));

    await waitFor(() =>
      expect(mocks.addPlanningItem).toHaveBeenCalledWith({
        planningEventId: planningEvent.id,
        kind: "meal",
        title: "Lunch",
        timezone: planningEvent.timezone
      })
    );
    const lunch = await screen.findByRole("listitem", { name: "Plan item 3: Lunch" });
    expect(lunch).toHaveClass("plan-item-added");
    expect(screen.getByRole("status")).toHaveTextContent("highlighted");
  });

  it("creates one cab route from consecutive selected items", async () => {
    const user = userEvent.setup();
    const onOpenEvent = vi.fn();
    mocks.createCabRouteFromPlanning.mockResolvedValue({
      itinerary: { ...planningEvent, id: "cab-1", event_type: "cab" },
      warnings: []
    });
    renderWithClient(
      <ControlledPlanningItems
        tripId="trip-1"
        planningEvent={planningEvent}
        travelerIds={[]}
        itinerary={[planningEvent]}
        editable
        onOpenEvent={onOpenEvent}
      />
    );

    await user.click(
      await screen.findByRole("checkbox", { name: "Select Hotel for event grouping" })
    );
    await user.click(screen.getByRole("checkbox", { name: "Select Museum for event grouping" }));
    await user.click(screen.getByRole("button", { name: "Create cab · 2 stops" }));
    const dialog = screen.getByRole("dialog", { name: "Create this cab route?" });
    expect(dialog).toHaveTextContent("Every selected item becomes an ordered stop");
    await user.type(within(dialog).getByLabelText("Cab event name"), "Museum transfer");
    await user.click(within(dialog).getByRole("button", { name: "Create cab route" }));

    await waitFor(() =>
      expect(mocks.createCabRouteFromPlanning).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: "trip-1", planningEvent }),
        items,
        "Museum transfer"
      )
    );
    await waitFor(() => expect(onOpenEvent).toHaveBeenCalledWith("cab-1"));
  });

  it("creates one activity with selected plan items as ordered Moments", async () => {
    const user = userEvent.setup();
    const onOpenEvent = vi.fn();
    mocks.createActivityFromPlanning.mockResolvedValue({
      itinerary: { ...planningEvent, id: "activity-1", event_type: "activity" },
      warnings: []
    });
    renderWithClient(
      <ControlledPlanningItems
        tripId="trip-1"
        planningEvent={planningEvent}
        travelerIds={[]}
        itinerary={[planningEvent]}
        editable
        onOpenEvent={onOpenEvent}
      />
    );

    await user.click(
      await screen.findByRole("checkbox", { name: "Select Hotel for event grouping" })
    );
    await user.click(screen.getByRole("checkbox", { name: "Select Museum for event grouping" }));
    await user.click(screen.getByRole("button", { name: "Create activity · 2 Moments" }));
    const dialog = screen.getByRole("dialog", { name: "Create this activity?" });
    expect(dialog).toHaveTextContent("Every selected plan item becomes an ordered Moment");
    await user.type(within(dialog).getByLabelText("Activity name"), "Museum morning");
    await user.click(within(dialog).getByRole("button", { name: "Create activity" }));

    await waitFor(() =>
      expect(mocks.createActivityFromPlanning).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: "trip-1", planningEvent }),
        items,
        "Museum morning"
      )
    );
    await waitFor(() => expect(onOpenEvent).toHaveBeenCalledWith("activity-1"));
  });

  it("scrolls to and focuses the compact add-item form", async () => {
    const user = userEvent.setup();
    const added = item("item-3", 300, "Market");
    mocks.listPlanningItems.mockResolvedValueOnce(items).mockResolvedValue([...items, added]);
    mocks.addPlanningItem.mockResolvedValue(added);
    const scrollIntoView = vi.fn();
    const previousScrollIntoView = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
    renderWithClient(
      <ControlledPlanningItems
        tripId="trip-1"
        planningEvent={planningEvent}
        travelerIds={[]}
        itinerary={[planningEvent]}
        editable
      />
    );

    await user.click(await screen.findByRole("button", { name: "Add item" }));

    const name = screen.getByLabelText("Name");
    await waitFor(() => expect(name).toHaveFocus());
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: "center" }));
    expect(screen.getByText("Timing, place & notes")).toBeVisible();
    await user.type(name, "Market");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    const market = await screen.findByRole("listitem", { name: /Market/ });
    expect(market).toHaveClass("plan-item-added");
    await waitFor(() =>
      expect(scrollIntoView).toHaveBeenLastCalledWith(
        expect.objectContaining({ behavior: expect.any(String), block: "center" })
      )
    );
    HTMLElement.prototype.scrollIntoView = previousScrollIntoView;
  });

  it("expands editing inside its row while keeping extra information collapsed", async () => {
    const user = userEvent.setup();
    renderWithClient(
      <ControlledPlanningItems
        tripId="trip-1"
        planningEvent={planningEvent}
        travelerIds={[]}
        itinerary={[planningEvent]}
        editable
      />
    );

    await user.click(await screen.findByRole("button", { name: "Edit Museum" }));

    const editForm = screen.getByRole("form", { name: "Edit Museum" });
    expect(editForm.closest("li")).toHaveTextContent("Museum");
    expect(
      within(editForm).getByText("Timing, place & notes").closest("details")
    ).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "Convert Museum to an event" })).toBeVisible();
  });

  it("opens a deep-linked plan item immediately on the full Plan page", async () => {
    renderWithClient(
      <ControlledPlanningItems
        tripId="trip-1"
        planningEvent={planningEvent}
        travelerIds={[]}
        itinerary={[planningEvent]}
        editable
        initialFocusedItemId="item-2"
      />
    );

    expect(await screen.findByRole("dialog", { name: "Museum" })).toBeVisible();
  });
});
