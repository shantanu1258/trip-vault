import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { deriveAlerts } from "../alerts/engine";
import type { Trip } from "./types";
import { TripAttentionCard } from "./TripAttentionCard";

vi.mock("../../lib/supabase/client", () => ({ isSupabaseConfigured: false }));
vi.mock("../alerts/load", () => ({
  alertInputsQueryOptions: () => ({ queryKey: ["alerts"], queryFn: vi.fn() })
}));

const trip: Trip = {
  id: "trip-1",
  title: "Island trip",
  destination_summary: "Island",
  start_date: "2099-10-01",
  end_date: "2099-10-08",
  primary_timezone: "UTC",
  base_currency: "INR",
  status: "upcoming",
  created_at: "",
  updated_at: ""
};
const inputs: Parameters<typeof deriveAlerts>[0] = {
  trips: [trip],
  flights: [],
  requirements: [],
  reminders: [
    {
      id: "reminder-1",
      trip_id: trip.id,
      title: "Review travel documents",
      due_at: "2020-01-01T12:00:00Z",
      severity: "urgent",
      completed_at: null
    }
  ],
  states: []
};

function renderCard(data = inputs, trips = [trip]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["alerts"], data);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <TripAttentionCard trips={trips} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Trips attention card", () => {
  it("restores Home's urgent action with trip context and a full-card review link", () => {
    renderCard();
    expect(screen.getByText("Island trip")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review now: Review travel documents" })
    ).toHaveAttribute("href", "/trips/trip-1");
  });

  it.each(["dismissed", "snoozed"])("keeps %s alerts hidden", (state) => {
    renderCard({
      ...inputs,
      states: [
        {
          alert_key: "reminder:reminder-1:2020-01-01T12:00:00Z",
          read_at: null,
          dismissed_at: state === "dismissed" ? "2020-01-02T00:00:00Z" : null,
          snoozed_until: state === "snoozed" ? "2099-01-01T00:00:00Z" : null
        }
      ]
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not show a card when there are no urgent alerts", () => {
    renderCard({ ...inputs, reminders: [] });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("does not surface an unrelated trip's alert or an archived trip", () => {
    const { unmount } = renderCard({
      ...inputs,
      reminders: inputs.reminders.map((item) => ({ ...item, trip_id: "other-trip" }))
    });
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    unmount();
    renderCard(inputs, [{ ...trip, status: "archived" }]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
