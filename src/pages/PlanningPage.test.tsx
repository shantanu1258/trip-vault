import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PlanningPage } from "./PlanningPage";

const mocks = vi.hoisted(() => ({
  localProfileId: vi.fn().mockResolvedValue("member-1"),
  listParticipants: vi
    .fn()
    .mockResolvedValue([
      { id: "plan-1:traveler-1", itinerary_item_id: "plan-1", traveler_id: "traveler-1" }
    ])
}));

const planningEvent = {
  id: "plan-1",
  trip_id: "trip-1",
  title: "A day in Udaipur",
  event_type: "preparation",
  starts_at: "2026-10-03T06:30:00.000Z",
  ends_at: null,
  timezone: "Asia/Kolkata",
  location: { label: "Old City" },
  notes: null,
  applies_to_all_travelers: false,
  timing_mode: "date_only",
  scheduled_date: "2026-10-03",
  has_explicit_start_time: false,
  created_at: "2026-09-21T10:00:00.000Z"
};

vi.mock("../features/sync/localSync", () => ({ localProfileId: mocks.localProfileId }));
vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main>
}));
vi.mock("../features/workspace/api", () => ({
  listTripItineraryParticipants: mocks.listParticipants
}));
vi.mock("../features/queries/tripQueries", () => ({
  tripQueries: {
    trip: (tripId: string) => ({
      queryKey: ["trip", tripId],
      queryFn: async () => ({ id: tripId, title: "Rajasthan", primary_timezone: "Asia/Kolkata" })
    }),
    itinerary: (tripId: string) => ({
      queryKey: ["itinerary", tripId],
      queryFn: async () => [planningEvent]
    }),
    travelers: (tripId: string) => ({
      queryKey: ["travelers", tripId],
      queryFn: async () => [
        { id: "traveler-1", trip_id: tripId, display_name: "Shantanu", is_minor: false }
      ]
    }),
    members: (tripId: string) => ({
      queryKey: ["members", tripId],
      queryFn: async () => [
        {
          user_id: "member-1",
          role: "owner",
          participation_type: "traveler",
          joined_at: null,
          display_name: "Shantanu"
        }
      ]
    })
  }
}));
vi.mock("../features/planning/PlanningItems", () => ({
  PlanningItemsManager: ({
    editable,
    focusedItemId,
    modalHost,
    onFocusedItemChange
  }: {
    editable: boolean;
    focusedItemId?: string | null;
    modalHost?: HTMLElement | null;
    onFocusedItemChange?: (itemId: string | null) => void;
  }) => (
    <section
      aria-label="Planning item manager"
      data-editable={String(editable)}
      data-focused-item={focusedItemId ?? ""}
      data-modal-host={modalHost?.dataset.planModalHost ?? ""}
    >
      Plan controls
      <button type="button" onClick={() => onFocusedItemChange?.("item-2")}>
        Open Museum
      </button>
    </section>
  )
}));

function HistoryBackButton() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => navigate(-1)}>
      Back once
    </button>
  );
}

describe("PlanningPage", () => {
  it("shows a dedicated, editable day-plan page with its artwork inside the hero", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={["/trips/trip-1/planning/plan-1?item=item-2"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/trips/:tripId/planning/:planningEventId" element={<PlanningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole("heading", { name: "A day in Udaipur" })).toBeVisible();
    expect(await screen.findByText("Shantanu")).toBeVisible();
    expect(screen.getByLabelText("Planning item manager")).toHaveAttribute("data-editable", "true");
    expect(screen.getByLabelText("Planning item manager")).toHaveAttribute(
      "data-focused-item",
      "item-2"
    );
    expect(screen.getByLabelText("Planning item manager")).toHaveAttribute(
      "data-modal-host",
      "true"
    );
    expect(document.querySelector('[data-silhouette="preparation"]')).toBeVisible();
  });

  it("closes a page-level item sheet with one browser Back action", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={["/trips/trip-1/planning/plan-1"]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route
              path="/trips/:tripId/planning/:planningEventId"
              element={
                <>
                  <PlanningPage />
                  <HistoryBackButton />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const manager = await screen.findByLabelText("Planning item manager");
    await user.click(screen.getByRole("button", { name: "Open Museum" }));
    expect(manager).toHaveAttribute("data-focused-item", "item-2");

    await user.click(screen.getByRole("button", { name: "Back once" }));
    expect(manager).toHaveAttribute("data-focused-item", "");
  });
});
