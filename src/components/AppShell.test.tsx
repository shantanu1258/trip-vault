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
  return (
    <>
      <output aria-label="location">{`${location.pathname}${location.search}|${intent?.kind ?? "none"}|${intent?.view ?? "none"}`}</output>
      <button type="button" onClick={() => navigate(-1)}>
        History back
      </button>
    </>
  );
}

function renderShell(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter
        initialEntries={[path]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AppShell>
          <LocationProbe />
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("trip header search", () => {
  it("keeps the current trip when opening Vault from either navigation", () => {
    renderShell("/trips/trip-1/bookings/booking-1");
    for (const link of screen.getAllByRole("link", { name: "Vault" })) {
      expect(link).toHaveAttribute("href", "/vault?trip=trip-1");
    }
  });
  it("opens active notifications in a modal without leaving the current trip", async () => {
    renderShell("/trips/trip-1?view=details");
    await userEvent.click(screen.getByRole("button", { name: "Alerts" }));
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("No active notifications right now.")).toBeInTheDocument();
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/trips/trip-1?view=details&notifications=active"
    );
    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/trips/trip-1?view=details|none|none"
    );
  });
  it("keeps only Trips, Vault, and Profile in primary navigation", () => {
    renderShell("/trips");
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Trips" })).toHaveLength(2);
  });
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
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/trips/trip-1?view=details|none|none"
    );
  });

  it("is absent outside an active trip", () => {
    renderShell("/profile");

    expect(screen.queryByRole("button", { name: "Search this trip" })).not.toBeInTheDocument();
  });
});
