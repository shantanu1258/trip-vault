import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { readTripNavigationIntent } from "../features/trips/navigation";
import { AppShell } from "./AppShell";

vi.mock("./Brand", () => ({ Brand: () => <span>Trip Vault</span> }));
vi.mock("./ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("../features/sync/SyncStatus", () => ({ SyncStatus: () => null }));
vi.mock("../lib/supabase/client", () => ({ isSupabaseConfigured: false }));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  const intent = readTripNavigationIntent(location.state, "trip-1");
  return <><output aria-label="location">{`${location.pathname}${location.search}|${intent?.kind ?? "none"}|${intent?.view ?? "none"}`}</output><button type="button" onClick={() => navigate(-1)}>History back</button></>;
}

function renderShell(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppShell><LocationProbe /></AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("trip header search", () => {
  it("opens the trip timeline with a one-shot search intent from a child page", async () => {
    renderShell("/trips/trip-1/bookings/booking-1");

    await userEvent.click(screen.getByRole("button", { name: "Search this trip" }));

    expect(screen.getByLabelText("location")).toHaveTextContent("/trips/trip-1|search|timeline");
  });

  it("leaves Trip details for timeline search instead of invoking the current-item jump", async () => {
    renderShell("/trips/trip-1?view=details");

    await userEvent.click(screen.getByRole("button", { name: "Search this trip" }));

    expect(screen.getByLabelText("location")).toHaveTextContent("/trips/trip-1|search|timeline");
    await userEvent.click(screen.getByRole("button", { name: "History back" }));
    expect(screen.getByLabelText("location")).toHaveTextContent("/trips/trip-1?view=details|none|none");
  });

  it("is absent outside an active trip", () => {
    renderShell("/profile");

    expect(screen.queryByRole("button", { name: "Search this trip" })).not.toBeInTheDocument();
  });
});
