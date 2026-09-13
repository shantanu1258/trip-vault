import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../features/trips/types";
import { RootRoute } from "./RootRoute";

const getSavedTripFocus = vi.fn();
const listTrips = vi.fn();

vi.mock("../lib/auth/useDeviceAuthentication", () => ({
  useDeviceAuthentication: () => true
}));

vi.mock("../features/trips/api", () => ({
  getSavedTripFocus: () => getSavedTripFocus(),
  listTrips: () => listTrips()
}));

function dateFromToday(days: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function trip(id: string, startOffset: number, endOffset: number, status: Trip["status"] = "upcoming"): Trip {
  return {
    id,
    title: `Trip ${id}`,
    destination_summary: "Somewhere",
    start_date: dateFromToday(startOffset),
    end_date: dateFromToday(endOffset),
    primary_timezone: "UTC",
    base_currency: "USD",
    status,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z"
  };
}

function TripProbe() {
  const { tripId } = useParams();
  return <><p>Opened trip {tripId}</p><Link to="/home">Go home</Link></>;
}

function renderLaunch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/trips/:tripId" element={<TripProbe />} />
          <Route path="/home" element={<p>Home dashboard</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("fresh launch trip routing", () => {
  beforeEach(() => {
    getSavedTripFocus.mockReset();
    listTrips.mockReset();
  });

  it("waits for saved focus before choosing between overlapping current trips", async () => {
    let resolveFocus!: (tripId: string | null) => void;
    getSavedTripFocus.mockReturnValue(new Promise<string | null>((resolve) => { resolveFocus = resolve; }));
    listTrips.mockResolvedValue([trip("soon", 0, 1), trip("saved", 0, 3)]);

    renderLaunch();

    expect(await screen.findByLabelText("Opening Trip Vault")).toBeInTheDocument();
    expect(screen.queryByText(/Opened trip/)).not.toBeInTheDocument();

    await act(async () => { resolveFocus("saved"); });
    expect(await screen.findByText("Opened trip saved")).toBeInTheDocument();
  });

  it("deterministically opens the earliest-ending trip when current trips overlap without saved focus", async () => {
    getSavedTripFocus.mockResolvedValue(null);
    listTrips.mockResolvedValue([trip("later", 0, 3), trip("sooner", 0, 1)]);

    renderLaunch();

    expect(await screen.findByText("Opened trip sooner")).toBeInTheDocument();
  });

  it("treats the day before departure as the current-trip launch window", async () => {
    getSavedTripFocus.mockResolvedValue(null);
    listTrips.mockResolvedValue([trip("tomorrow", 1, 4)]);

    renderLaunch();

    expect(await screen.findByText("Opened trip tomorrow")).toBeInTheDocument();
  });

  it("stays on Home when the traveler explicitly returns there in the same app session", async () => {
    const user = userEvent.setup();
    getSavedTripFocus.mockResolvedValue(null);
    listTrips.mockResolvedValue([trip("active", 0, 2)]);

    renderLaunch();
    await user.click(await screen.findByRole("link", { name: "Go home" }));

    expect(await screen.findByText("Home dashboard")).toBeInTheDocument();
    expect(getSavedTripFocus).toHaveBeenCalledTimes(1);
    expect(listTrips).toHaveBeenCalledTimes(1);
  });

  it("does not reopen an archived or non-current trip", async () => {
    getSavedTripFocus.mockResolvedValue("archived");
    listTrips.mockResolvedValue([trip("archived", 0, 2, "archived"), trip("future", 3, 5)]);

    renderLaunch();

    expect(await screen.findByText("Home dashboard")).toBeInTheDocument();
  });
});
