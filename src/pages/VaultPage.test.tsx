import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listVaultDocuments: vi.fn(),
  listArchivedVaultDocuments: vi.fn(),
  listTrips: vi.fn(),
  listItinerary: vi.fn(),
  listReminders: vi.fn(),
  listRequirements: vi.fn(),
  listReferences: vi.fn(),
  listTravelers: vi.fn(),
  listBookings: vi.fn(),
  restoreDocument: vi.fn()
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("../features/workspace/api", () => ({
  listRequirements: mocks.listRequirements,
  listTravelers: mocks.listTravelers,
  listBookings: mocks.listBookings,
  listVaultDocuments: mocks.listVaultDocuments,
  listArchivedVaultDocuments: mocks.listArchivedVaultDocuments,
  restoreDocument: mocks.restoreDocument
}));
vi.mock("../features/trips/api", () => ({
  listTrips: mocks.listTrips,
  listItinerary: mocks.listItinerary,
  listReminders: mocks.listReminders
}));
vi.mock("../features/workspace/tripRelationships", () => ({
  listTripEventDocumentReferences: mocks.listReferences
}));

import { VaultPage } from "./VaultPage";

function typeButton(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${label} ·`) });
}

describe("VaultPage document list", () => {
  it("keeps the selected type, traveler, and search after document navigation and browser Back", async () => {
    mocks.listVaultDocuments.mockResolvedValue([
      {
        id: "doc",
        trip_id: "trip-1",
        title: "Sam visa",
        category: "visa",
        purpose: "visa",
        visibility: "trip",
        assignment_mode: "shared"
      },
      {
        id: "flight",
        trip_id: "trip-1",
        title: "Flight ticket",
        category: "flight",
        purpose: "ticket",
        visibility: "trip",
        assignment_mode: "shared"
      }
    ]);
    mocks.listTravelers.mockResolvedValue([{ id: "sam", trip_id: "trip-1", display_name: "Sam" }]);
    function Document() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>Browser Back</button>;
    }
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={["/vault"]}>
          <Routes>
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/trips/:tripId/documents/:documentId" element={<Document />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    await userEvent.click(await screen.findByRole("button", { name: "Filters" }));
    await screen.findByRole("option", { name: "Sam · Bali" });
    await userEvent.selectOptions(
      screen.getByLabelText("Filter Vault documents by traveler"),
      "trip-1:sam"
    );
    await userEvent.click(typeButton("Visas"));
    await userEvent.type(screen.getByLabelText("Search documents"), "Sam");
    await userEvent.click(screen.getByRole("link", { name: /Sam visa/ }));
    await userEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    expect(await screen.findByRole("button", { name: "Visas · 1" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByLabelText("Filter Vault documents by traveler")).toHaveValue("trip-1:sam");
    expect(screen.getByLabelText("Search documents")).toHaveValue("Sam");
    expect(screen.getByRole("heading", { name: "Sam visa" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Flight ticket" })).not.toBeInTheDocument();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listReminders.mockResolvedValue([]);
    mocks.listRequirements.mockResolvedValue([]);
    mocks.listReferences.mockResolvedValue([]);
    mocks.listArchivedVaultDocuments.mockResolvedValue([]);
    mocks.restoreDocument.mockResolvedValue(undefined);
    mocks.listTrips.mockResolvedValue([
      { id: "trip-1", title: "Bali" },
      { id: "trip-2", title: "Japan" }
    ]);
    mocks.listTravelers.mockResolvedValue([]);
    mocks.listBookings.mockResolvedValue([]);
  });

  function setupFilters(path = "/vault") {
    const now = Date.now();
    mocks.listVaultDocuments.mockResolvedValue([
      {
        id: "booked",
        trip_id: "trip-1",
        booking_id: "booking-1",
        title: "Flight booking",
        category: "flight",
        purpose: "ticket",
        assignment_mode: "shared",
        visibility: "trip"
      },
      {
        id: "linked",
        trip_id: "trip-1",
        title: "Sam arrival",
        category: "arrival_card",
        purpose: "arrival_card",
        assignment_mode: "selected",
        traveler_ids: ["sam"],
        visibility: "trip"
      },
      {
        id: "unlinked",
        trip_id: "trip-1",
        title: "General visa",
        category: "visa",
        purpose: "visa",
        assignment_mode: "shared",
        visibility: "trip"
      },
      {
        id: "japan",
        trip_id: "trip-2",
        title: "Japan ticket",
        category: "flight",
        purpose: "ticket",
        assignment_mode: "shared",
        visibility: "trip"
      }
    ]);
    mocks.listItinerary.mockImplementation(async (id) =>
      id === "trip-1"
        ? [
            {
              id: "event-1",
              trip_id: id,
              booking_id: "booking-1",
              title: "Fly to Bali",
              event_type: "flight",
              starts_at: new Date(now + 3600000).toISOString(),
              ends_at: new Date(now + 7200000).toISOString()
            },
            {
              id: "event-2",
              trip_id: id,
              title: "Evening meal",
              event_type: "meal",
              starts_at: new Date(now + 14400000).toISOString()
            }
          ]
        : []
    );
    // Current trip begins at its first reminder, not the future flight/trip date.
    mocks.listReminders.mockResolvedValue([
      { trip_id: "trip-1", due_at: new Date(now - 3600000).toISOString() }
    ]);
    mocks.listTravelers.mockImplementation(async (id) =>
      id === "trip-1" ? [{ id: "sam", trip_id: id, display_name: "Sam" }] : []
    );
    mocks.listReferences.mockResolvedValue([
      { id: "link", itinerary_item_id: "event-1", document_id: "linked" }
    ]);
    function Document() {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>Browser Back</button>;
    }
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/vault" element={<VaultPage />} />
            <Route path="/trips/:tripId/documents/:documentId" element={<Document />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it("selects the current trip from reminder dates, keeps explicit All trips, and scopes event/traveler filters", async () => {
    setupFilters();
    const trip = await screen.findByLabelText("Filter Vault documents by trip");
    await waitFor(() => expect(trip).toHaveValue("trip-1"));
    expect(screen.queryByRole("heading", { name: "Japan ticket" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add document" })).toHaveAttribute(
      "href",
      "/vault/add?trip=trip-1"
    );
    expect(screen.getByLabelText("Filter Vault documents by event")).not.toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await screen.findByRole("option", { name: "Fly to Bali" });
    await userEvent.selectOptions(
      screen.getByLabelText("Filter Vault documents by event"),
      "event-1"
    );
    await userEvent.selectOptions(
      screen.getByLabelText("Filter Vault documents by traveler"),
      "trip-1:sam"
    );
    expect(await screen.findByRole("heading", { name: "Sam arrival" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Flight booking" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "General visa" })).not.toBeInTheDocument();
    await userEvent.click(typeButton("Arrival cards"));
    await userEvent.click(screen.getByRole("link", { name: /Sam arrival/ }));
    await userEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    expect(await screen.findByLabelText("Filter Vault documents by event")).toHaveValue("event-1");
    expect(screen.getByLabelText("Filter Vault documents by trip")).toHaveValue("trip-1");
    expect(typeButton("Arrival cards")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByLabelText("Filter Vault documents by traveler")).toHaveValue("trip-1:sam");
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(screen.getByRole("button", { name: "Remove Fly to Bali filter" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Remove Fly to Bali filter" }));
    expect(screen.getByLabelText("Filter Vault documents by event")).toHaveValue("all");
    expect(screen.getByLabelText("Filter Vault documents by trip")).toHaveValue("trip-1");
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    await userEvent.selectOptions(screen.getByLabelText("Filter Vault documents by trip"), "all");
    expect(screen.getByLabelText("Filter Vault documents by event")).toHaveValue("all");
    expect(screen.getByLabelText("Filter Vault documents by event")).toBeDisabled();
    expect(screen.getByLabelText("Filter Vault documents by traveler")).toHaveValue("all");
    await userEvent.click(typeButton("All"));
    expect(screen.getByRole("heading", { name: "Japan ticket" })).toBeVisible();
    expect(screen.getByLabelText("Filter Vault documents by trip")).toHaveValue("all");
  });

  it.each(["trip-2", "all"])(
    "honors an explicit %s selection over the current trip",
    async (trip) => {
      setupFilters(`/vault?trip=${trip}`);
      expect(await screen.findByRole("heading", { name: "Japan ticket" })).toBeVisible();
      expect(screen.getByLabelText("Filter Vault documents by trip")).toHaveValue(trip);
    }
  );

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
    expect(row).toContainElement(
      screen.getByRole("img", { name: "Visible to all signed-in trip members" })
    );
    expect(
      screen.queryByRole("button", { name: `Who can open ${longTitle}?` })
    ).not.toBeInTheDocument();
    const archived = screen.getByRole("button", { name: "Recently deleted" });
    expect(archived.textContent).toBe("");
    expect(archived).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(archived);
    expect(screen.getByRole("button", { name: "Current documents" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(await screen.findByText("No recently deleted documents.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("button", { name: "All · 0" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Flights · 1" })).not.toBeInTheDocument();
  });

  it("combines compact type and trip selectors with trip-qualified travelers and search", async () => {
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
    await userEvent.click(await screen.findByRole("button", { name: "Filters" }));
    await screen.findByRole("button", { name: "Buses · 1" });
    expect(screen.getByRole("group", { name: "Document types" })).toHaveClass("overflow-x-auto");
    expect(screen.queryByLabelText("Filter Vault documents by type")).not.toBeInTheDocument();
    expect(typeButton("All")).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("textbox", { name: "Search documents" }).parentElement?.parentElement
    ).toHaveClass("flex");
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await userEvent.click(typeButton("Other transport"));
    expect(screen.getByRole("heading", { name: "Unassigned transport file" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bali bus" })).not.toBeInTheDocument();
    await userEvent.click(typeButton("All"));
    expect(await screen.findByRole("option", { name: "Sam · Bali" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Sam · Japan" })).toBeInTheDocument();
    const travelerFilter = screen.getByRole("combobox", {
      name: "Filter Vault documents by traveler"
    });
    await userEvent.selectOptions(travelerFilter, "trip-1:bali-sam");
    expect(typeButton("All")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All · 2" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Japan shared flight" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Other traveler flight" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Unassigned transport file" })
    ).not.toBeInTheDocument();
    await userEvent.click(typeButton("Buses"));
    expect(typeButton("Buses")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Bali bus" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bali shared ferry" })).not.toBeInTheDocument();
    await userEvent.selectOptions(travelerFilter, "trip-2:japan-sam");
    expect(typeButton("Buses")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Buses · 0" })).toBeInTheDocument();
    expect(screen.getByText("No documents match this search.")).toBeVisible();
    await userEvent.click(typeButton("All"));
    expect(screen.getByRole("heading", { name: "Japan shared flight" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Japan Sam visa" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Bali bus" })).not.toBeInTheDocument();
    await userEvent.type(screen.getByRole("textbox", { name: "Search documents" }), "visa");
    expect(screen.queryByRole("heading", { name: "Japan shared flight" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Japan Sam visa" })).toBeVisible();
    await userEvent.selectOptions(travelerFilter, "all");
    expect(screen.getByRole("textbox", { name: "Search documents" })).toHaveValue("visa");
    expect(typeButton("All")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All · 6" })).toBeInTheDocument();
  });
});
