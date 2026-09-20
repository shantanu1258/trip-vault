import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listVaultDocuments: vi.fn(),
  listArchivedVaultDocuments: vi.fn(),
  listTrips: vi.fn(),
  listTravelers: vi.fn(),
  listBookings: vi.fn(),
  restoreDocument: vi.fn()
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("../features/workspace/api", () => ({
  listTravelers: mocks.listTravelers,
  listBookings: mocks.listBookings,
  listVaultDocuments: mocks.listVaultDocuments,
  listArchivedVaultDocuments: mocks.listArchivedVaultDocuments,
  restoreDocument: mocks.restoreDocument
}));
vi.mock("../features/trips/api", () => ({ listTrips: mocks.listTrips }));

import { VaultPage } from "./VaultPage";

describe("VaultPage document list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.listArchivedVaultDocuments.mockResolvedValue([]);
    mocks.restoreDocument.mockResolvedValue(undefined);
    mocks.listTrips.mockResolvedValue([
      { id: "trip-1", title: "Bali" },
      { id: "trip-2", title: "Japan" }
    ]);
    mocks.listTravelers.mockResolvedValue([]);
    mocks.listBookings.mockResolvedValue([]);
  });

  it("links a document by its complete name and shows its visibility", async () => {
    const longTitle =
      "Other booking confirmation · Ankita · Some Place to Some Place with a deliberately long generated title";
    mocks.listVaultDocuments.mockResolvedValue([
      {
        id: "document-long",
        trip_id: "trip-1",
        booking_id: null,
        flight_leg_id: null,
        traveler_id: null,
        assignment_mode: "selected",
        traveler_ids: ["traveler-1"],
        title: longTitle,
        category: "flight",
        purpose: "confirmation",
        short_label: null,
        visibility: "trip",
        current_version_id: "version-1",
        current_version: { id: "version-1" },
        updated_at: "2026-09-01T00:00:00.000Z"
      }
    ]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <VaultPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const title = await screen.findByRole("heading", { name: longTitle });
    const row = title.closest("a");
    expect(row).toHaveAttribute("href", "/trips/trip-1/documents/document-long");
    expect(row).toHaveAccessibleName(new RegExp(longTitle));
    expect(row?.querySelector('[data-document-type="flight"]')).toHaveAttribute(
      "data-emphasis",
      "strong"
    );
    expect(screen.getByLabelText("Visible to all signed-in trip members")).toBeInTheDocument();
    const archived = screen.getByRole("button", { name: "Recently deleted" });
    expect(archived.textContent).toBe("");
    expect(archived).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(archived);
    expect(screen.getByRole("button", { name: "Current documents" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(await screen.findByText("No recently deleted documents.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "All · 0" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Flights · 1" })).not.toBeInTheDocument();
  });

  it("combines a scrollable type strip with trip-qualified travelers and search", async () => {
    const docs = [
      {
        id: "bus",
        trip_id: "trip-1",
        title: "Bali bus",
        booking_id: "bus-booking",
        category: "transport",
        assignment_mode: "selected",
        traveler_ids: ["bali-sam"]
      },
      {
        id: "shared",
        trip_id: "trip-1",
        title: "Bali shared ferry",
        booking_id: "ferry-booking",
        category: "transport",
        assignment_mode: "shared"
      },
      {
        id: "other",
        trip_id: "trip-1",
        title: "Other traveler flight",
        category: "flight",
        assignment_mode: "selected",
        traveler_ids: ["bali-lee"]
      },
      {
        id: "unknown",
        trip_id: "trip-1",
        title: "Unassigned transport file",
        category: "transport",
        assignment_mode: "unassigned"
      },
      {
        id: "japan",
        trip_id: "trip-2",
        title: "Japan shared flight",
        category: "flight",
        assignment_mode: "shared"
      },
      {
        id: "japan-sam",
        trip_id: "trip-2",
        title: "Japan Sam visa",
        category: "visa",
        assignment_mode: "selected",
        traveler_ids: ["japan-sam"]
      }
    ].map((doc) => ({ purpose: "ticket", visibility: "trip", traveler_id: null, ...doc }));
    mocks.listVaultDocuments.mockResolvedValue(docs);
    mocks.listTravelers.mockImplementation(async (tripId) =>
      tripId === "trip-1"
        ? [
            { id: "bali-sam", trip_id: tripId, display_name: "Sam" },
            { id: "bali-lee", trip_id: tripId, display_name: "Lee" }
          ]
        : [{ id: "japan-sam", trip_id: tripId, display_name: "Sam" }]
    );
    mocks.listBookings.mockResolvedValue([
      { id: "bus-booking", trip_id: "trip-1", type: "bus" },
      { id: "ferry-booking", trip_id: "trip-1", type: "ferry" }
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <VaultPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    await screen.findByRole("button", { name: "Buses · 1" });
    const types = screen.getByRole("group", { name: "Document types" });
    expect(types).toHaveClass("overflow-x-auto", "rounded-2xl");
    expect(types).not.toHaveClass("flex-wrap");
    expect(
      screen.getByRole("textbox", { name: "Search documents" }).parentElement?.parentElement
    ).toHaveClass("grid-cols-2");
    expect(screen.queryByRole("button", { name: "Filters" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Other transport · 1" }));
    expect(screen.getByRole("heading", { name: "Unassigned transport file" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bali bus" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All · 6" }));
    expect(await screen.findByRole("option", { name: "Sam · Bali" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sam · Japan" })).toBeInTheDocument();
    const travelerFilter = screen.getByRole("combobox", {
      name: "Filter Vault documents by traveler"
    });
    await userEvent.selectOptions(travelerFilter, "trip-1:bali-sam");
    expect(screen.getByRole("button", { name: "All · 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("heading", { name: "Japan shared flight" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Other traveler flight" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Unassigned transport file" })
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Buses · 1" }));
    expect(screen.getByRole("button", { name: "Buses · 1" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("heading", { name: "Bali bus" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bali shared ferry" })).not.toBeInTheDocument();
    await userEvent.selectOptions(travelerFilter, "trip-2:japan-sam");
    expect(screen.getByRole("button", { name: "Buses · 0" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("No documents match this search.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "All · 2" }));
    expect(screen.getByRole("heading", { name: "Japan shared flight" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Japan Sam visa" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bali bus" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Search documents" }), "visa");
    expect(screen.queryByRole("heading", { name: "Japan shared flight" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Japan Sam visa" })).toBeVisible();
    await userEvent.selectOptions(travelerFilter, "all");
    expect(screen.getByRole("textbox", { name: "Search documents" })).toHaveValue("visa");
    expect(screen.getByRole("button", { name: "All · 6" })).toHaveAttribute("aria-pressed", "true");
  });
});
