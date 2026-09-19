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

function trip(
  id: string,
  startOffset: number,
  endOffset: number,
  status: Trip["status"] = "upcoming"
): Trip {
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
  return (
    <>
      <p>Opened trip {tripId}</p>
      <Link to="/trips">All trips</Link>
    </>
  );
}

function renderLaunch() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={["/"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route path="/" element={<RootRoute />} />
          <Route path="/trips/:tripId" element={<TripProbe />} />
          <Route path="/trips" element={<p>Trips landing</p>} />
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

  it("asks the traveler to choose when travel windows overlap", async () => {
    listTrips.mockResolvedValue([trip("first", 0, 1), trip("second", 5, 9)]);
    renderLaunch();
    expect(await screen.findByText("Trips landing")).toBeInTheDocument();
    expect(screen.queryByText(/Opened trip/)).not.toBeInTheDocument();
  });
  it.each([0, 1, 9, 10])("opens the only relevant trip %i days before departure", async (days) => {
    listTrips.mockResolvedValue([trip("soon", days, days + 5)]);
    renderLaunch();
    expect(await screen.findByText("Opened trip soon")).toBeInTheDocument();
  });
  it("does not reopen an archived, ended, or distant trip", async () => {
    listTrips.mockResolvedValue([
      trip("archive", 0, 2, "archived"),
      trip("past", -8, -1),
      trip("future", 11, 15)
    ]);
    renderLaunch();
    expect(await screen.findByText("Trips landing")).toBeInTheDocument();
  });
  it("does not redirect when the traveler returns to all trips", async () => {
    listTrips.mockResolvedValue([trip("active", 0, 2)]);
    renderLaunch();
    await userEvent.click(await screen.findByRole("link", { name: "All trips" }));
    expect(await screen.findByText("Trips landing")).toBeInTheDocument();
    expect(listTrips).toHaveBeenCalledTimes(1);
  });
  it("falls back to Trips when the trip list fails", async () => {
    listTrips.mockRejectedValue(new Error("offline"));
    renderLaunch();
    expect(await screen.findByText("Trips landing")).toBeInTheDocument();
  });
});
