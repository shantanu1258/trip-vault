import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { ConfirmDialogProvider } from "../../components/ConfirmDialogProvider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem } from "../trips/types";
import type { EventDocumentLink, Traveler, VaultDocument } from "./types";
import { readTripReturnContext, tripChildNavigationState } from "../trips/navigation";

const mocks = vi.hoisted(() => ({
  attachDocumentsToEvent: vi.fn(),
  listEventDocumentLinks: vi.fn(),
  listVaultDocuments: vi.fn(),
  reorderEventDocuments: vi.fn(),
  unlinkDocumentFromEvent: vi.fn()
}));

vi.mock("./api", () => ({
  attachDocumentsToEvent: mocks.attachDocumentsToEvent,
  listEventDocumentLinks: mocks.listEventDocumentLinks,
  listVaultDocuments: mocks.listVaultDocuments,
  reorderEventDocuments: mocks.reorderEventDocuments,
  unlinkDocumentFromEvent: mocks.unlinkDocumentFromEvent
}));

import { EventDocuments, EventDocumentShortcut } from "./EventDocuments";

const item: ItineraryItem = {
  id: "event-1",
  trip_id: "trip-1",
  booking_id: "booking-1",
  title: "Bus to Kuala Lumpur",
  event_type: "bus",
  starts_at: "2026-09-30T01:00:00.000Z",
  ends_at: null,
  timezone: "Asia/Singapore",
  location: null,
  notes: null,
  applies_to_all_travelers: false,
  timing_mode: "exact",
  event_status: "planned",
  created_at: "2026-09-01T00:00:00.000Z"
};

function document(overrides: Partial<VaultDocument>): VaultDocument {
  return {
    id: "document-1",
    trip_id: item.trip_id,
    booking_id: item.booking_id ?? null,
    flight_leg_id: null,
    journey_leg_id: null,
    traveler_id: null,
    assignment_mode: "shared",
    traveler_ids: [],
    title: "Bus ticket",
    category: "transport",
    purpose: "ticket",
    short_label: null,
    visibility: "trip",
    current_version_id: "version-1",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides
  };
}

function link(value: VaultDocument, sortOrder: number): EventDocumentLink {
  return {
    itinerary_item_id: item.id,
    document_id: value.id,
    label: null,
    sort_order: sortOrder,
    document: value
  };
}

function renderShortcut(travelerId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/trips/trip-1"]}>
        <LocationProbe />
        <EventDocumentShortcut
          item={item}
          travelerId={travelerId}
          navigationState={tripChildNavigationState(
            null,
            item.trip_id,
            "timeline",
            "/trips/trip-1"
          )}
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function traveler(id: string, displayName: string): Traveler {
  return {
    id,
    trip_id: item.trip_id,
    display_name: displayName,
    is_minor: false,
    created_at: "2026-09-01T00:00:00.000Z"
  };
}

let currentLocationState: unknown;
function LocationProbe() {
  const location = useLocation();
  currentLocationState = location.state;
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

function renderDocuments(
  travelers: Traveler[] = [],
  compact = false,
  travelerId?: string,
  onUpload?: () => void
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/trips/trip-1?view=details"]}>
        <LocationProbe />
        <ConfirmDialogProvider>
          <EventDocuments
            item={item}
            canEdit
            travelers={travelers}
            compact={compact}
            travelerId={travelerId}
            onUpload={onUpload}
          />
        </ConfirmDialogProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("timeline primary document shortcut", () => {
  beforeEach(() => {
    mocks.listEventDocumentLinks.mockReset().mockResolvedValue([]);
    mocks.listVaultDocuments.mockReset().mockResolvedValue([]);
  });

  it("captures the timeline position at click time for both Back and browser Back", async () => {
    mocks.listEventDocumentLinks.mockResolvedValue([link(document({}), 0)]);
    renderShortcut();
    const shortcut = await screen.findByRole("link", { name: "Open Ticket: Bus ticket" });
    const scroll = vi.spyOn(window, "scrollY", "get").mockReturnValue(1400);
    const bounds = vi
      .spyOn(shortcut, "getBoundingClientRect")
      .mockReturnValue({ top: 170 } as DOMRect);
    await userEvent.click(shortcut);
    expect(readTripReturnContext(currentLocationState, item.trip_id)).toMatchObject({
      view: "timeline",
      path: "/trips/trip-1",
      scroll: { y: 1400, anchorOffset: 170 }
    });
    expect(JSON.parse(sessionStorage.getItem("trip-vault:scroll:trip-1:timeline")!)).toMatchObject({
      y: 1400,
      anchorOffset: 170
    });
    scroll.mockRestore();
    bounds.mockRestore();
  });

  it("labels and opens the first explicitly related document visible to the focused traveler", async () => {
    const otherTraveler = document({
      id: "other-pass",
      title: "Asha boarding pass",
      purpose: "boarding_pass",
      assignment_mode: "selected",
      traveler_id: "asha",
      traveler_ids: ["asha"]
    });
    const focusedVisa = document({
      id: "ravi-visa",
      booking_id: null,
      title: "Ravi visa",
      purpose: "visa",
      assignment_mode: "selected",
      traveler_id: "ravi",
      traveler_ids: ["ravi"],
      short_label: "UAE"
    });
    mocks.listEventDocumentLinks.mockResolvedValue([link(otherTraveler, 0), link(focusedVisa, 1)]);

    renderShortcut("ravi");

    const shortcut = await screen.findByRole("link", { name: "Open Visa: Ravi visa" });
    expect(shortcut).toHaveAttribute("href", "/trips/trip-1/documents/ravi-visa");
    expect(shortcut).toHaveTextContent("Open Visa · UAE");
    expect(shortcut).toContainElement(
      screen.getByLabelText("Visible to all signed-in trip members")
    );
    expect(shortcut).toHaveTextContent("Trip members");
    expect(screen.queryByRole("link", { name: /Asha boarding pass/ })).not.toBeInTheDocument();
  });

  it("falls back to a traveler-visible booking document when no explicit link is visible", async () => {
    const hidden = document({
      id: "hidden",
      booking_id: null,
      assignment_mode: "selected",
      traveler_id: "asha",
      traveler_ids: ["asha"]
    });
    const bookingTicket = document({ id: "booking-ticket", title: "Shared operator ticket" });
    mocks.listEventDocumentLinks.mockResolvedValue([link(hidden, 0)]);
    mocks.listVaultDocuments.mockResolvedValue([bookingTicket]);

    renderShortcut("ravi");

    expect(
      await screen.findByRole("link", { name: "Open Ticket: Shared operator ticket" })
    ).toHaveAttribute("href", "/trips/trip-1/documents/booking-ticket");
  });
});

describe("event document cards", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mocks.reorderEventDocuments.mockReset().mockResolvedValue(undefined);
    mocks.listEventDocumentLinks.mockReset().mockResolvedValue([]);
    mocks.listVaultDocuments.mockReset().mockResolvedValue([]);
  });

  it("moves documents within their traveler section without moving other sections", async () => {
    const first = document({ id: "first", title: "First ticket" });
    const second = document({ id: "second", title: "Second ticket" });
    const personal = document({
      id: "personal",
      title: "Asha visa",
      assignment_mode: "selected",
      traveler_ids: ["asha"]
    });
    mocks.listEventDocumentLinks.mockResolvedValue([
      link(first, 0),
      link(personal, 1),
      link(second, 2)
    ]);
    renderDocuments([traveler("asha", "Asha")]);
    const earlier = await screen.findByRole("button", { name: "Move First ticket earlier" });
    expect(earlier).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Second ticket later" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Move Asha visa later" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move Second ticket earlier" }));
    expect(mocks.reorderEventDocuments).toHaveBeenCalledWith(item.id, [
      "second",
      "personal",
      "first"
    ]);
    expect(screen.getByTestId("location")).toHaveTextContent("/trips/trip-1?view=details");
  });

  it("persists ordering for documents inherited from the booking", async () => {
    mocks.attachDocumentsToEvent.mockReset().mockResolvedValue([]);
    mocks.listVaultDocuments.mockResolvedValue([
      document({ id: "first", title: "First ticket" }),
      document({ id: "second", title: "Second ticket" })
    ]);
    renderDocuments();
    await userEvent.click(
      await screen.findByRole("button", { name: "Move Second ticket earlier" })
    );
    expect(mocks.attachDocumentsToEvent).toHaveBeenCalledWith(item, ["first", "second"]);
    expect(mocks.reorderEventDocuments).toHaveBeenCalledWith(item.id, ["second", "first"]);
  });

  it("puts existing documents before secondary upload and attach actions", async () => {
    mocks.listEventDocumentLinks.mockResolvedValue([link(document({}), 0)]);
    const upload = vi.fn();
    renderDocuments([], false, undefined, upload);
    const ticket = await screen.findByRole("link", { name: /Bus ticket/ });
    for (const name of ["Upload new", "Attach existing"]) {
      const action = screen.getByRole("button", { name });
      expect(
        ticket.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(action).toHaveClass("text-xs");
    }
    await userEvent.click(screen.getByRole("button", { name: "Upload new" }));
    expect(upload).toHaveBeenCalledOnce();
  });

  it("emphasizes document actions when the event has no documents", async () => {
    renderDocuments([], false, undefined, vi.fn());
    await screen.findByText("No documents attached yet.");
    expect(screen.getByRole("button", { name: "Upload new" })).toHaveClass("primary-button");
    expect(screen.getByRole("button", { name: "Attach existing" })).toHaveClass("secondary-button");
  });

  it("keeps shared documents visible and collapses personal groups in compact mode", async () => {
    const shared = document({ id: "shared", title: "Shared ticket" });
    const personal = document({
      id: "personal",
      title: "Asha ticket",
      assignment_mode: "selected",
      traveler_id: "asha",
      traveler_ids: ["asha"]
    });
    mocks.listEventDocumentLinks.mockResolvedValue([link(shared, 0), link(personal, 1)]);
    renderDocuments([traveler("asha", "Asha")], true);
    expect(await screen.findByRole("link", { name: "Shared ticket" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Asha ticket" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand documents for Asha" }));
    expect(screen.getByRole("link", { name: "Asha ticket" })).toHaveAttribute(
      "href",
      "/trips/trip-1/documents/personal"
    );
    await userEvent.click(screen.getByRole("button", { name: "Collapse documents for Asha" }));
    expect(screen.queryByRole("link", { name: "Asha ticket" })).not.toBeInTheDocument();
  });

  it("leaves the focused traveler's documents expanded in compact mode", async () => {
    mocks.listEventDocumentLinks.mockResolvedValue([
      link(document({ id: "shared", title: "Shared ticket" }), 0),
      link(
        document({
          id: "personal",
          title: "Asha ticket",
          assignment_mode: "selected",
          traveler_id: "asha",
          traveler_ids: ["asha"]
        }),
        1
      )
    ]);
    renderDocuments([traveler("asha", "Asha")], true, "asha");
    expect(await screen.findByRole("link", { name: "Asha ticket" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Shared ticket" })).toBeVisible();
  });

  it("opens the whole document card including visibility, keeping unlink separate and confirmed", async () => {
    const longTitle =
      "Universal Studios and Oceanarium family activity booking confirmation for everyone";
    mocks.listEventDocumentLinks.mockResolvedValue([
      link(document({ id: "long-document", title: longTitle }), 0)
    ]);

    renderDocuments();

    const title = await screen.findByText(longTitle);
    const documentLink = title.closest("a");
    expect(documentLink).toHaveAccessibleName(longTitle);
    expect(documentLink).toHaveAttribute("href", "/trips/trip-1/documents/long-document");

    const visibility = screen.getByLabelText("Visible to all signed-in trip members");
    expect(documentLink).toContainElement(visibility);
    expect(documentLink).toHaveTextContent("Ticket");
    expect(documentLink).toHaveTextContent("Trip members");
    expect(screen.getByRole("heading", { name: /Documents/ })).toBeVisible();
    expect(screen.getByLabelText("1 attached document")).toBeVisible();
    expect(screen.getByText("For Everyone")).toBeVisible();

    const unlink = screen.getByRole("button", { name: `Unlink ${longTitle}` });
    expect(documentLink).not.toContainElement(unlink);
    expect(screen.queryByRole("button", { name: /Move .* earlier/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move .* later/ })).not.toBeInTheDocument();
    await userEvent.click(unlink);
    expect(await screen.findByRole("dialog", { name: "Unlink document?" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/trips/trip-1?view=details");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(mocks.unlinkDocumentFromEvent).not.toHaveBeenCalled();
    await userEvent.click(visibility);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/trips/trip-1/documents/long-document"
    );
    expect(mocks.unlinkDocumentFromEvent).not.toHaveBeenCalled();
  });

  it("groups associated documents by traveler while keeping shared documents together", async () => {
    const shared = document({ id: "shared", title: "Shared ferry confirmation" });
    const asha = document({
      id: "asha-ticket",
      title: "Asha ferry ticket",
      assignment_mode: "selected",
      traveler_id: "asha",
      traveler_ids: ["asha"]
    });
    const ravi = document({
      id: "ravi-ticket",
      title: "Ravi ferry ticket",
      assignment_mode: "selected",
      traveler_id: "ravi",
      traveler_ids: ["ravi"]
    });
    mocks.listEventDocumentLinks.mockResolvedValue([link(asha, 0), link(shared, 1), link(ravi, 2)]);

    renderDocuments([traveler("ravi", "Ravi Singh"), traveler("asha", "Asha Singh")]);

    const regions = await screen.findAllByRole("region");
    expect(regions.map((region) => region.getAttribute("aria-label"))).toEqual([
      "Everyone",
      "Ravi Singh",
      "Asha Singh"
    ]);
    const everyone = screen.getByRole("region", { name: "Everyone" });
    expect(within(everyone).getByText("Shared ferry confirmation")).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Asha Singh" })).getByText("Asha ferry ticket")
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Ravi Singh" })).getByText("Ravi ferry ticket")
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Unlink .* ferry/ })).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Move .* earlier/ })).not.toBeInTheDocument();

    const ashaToggle = screen.getByRole("button", { name: "Collapse documents for Asha Singh" });
    expect(ashaToggle).toHaveAttribute("aria-expanded", "true");
    expect(within(ashaToggle).getByText("For Asha Singh")).toBeVisible();
    await userEvent.click(ashaToggle);
    expect(screen.queryByText("Asha ferry ticket")).not.toBeInTheDocument();
    expect(screen.getByText("Shared ferry confirmation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand documents for Asha Singh" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });
});
