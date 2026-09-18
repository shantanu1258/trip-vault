import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem } from "../trips/types";
import type { EventDocumentLink, Traveler, VaultDocument } from "./types";

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
      <MemoryRouter>
        <EventDocumentShortcut
          item={item}
          travelerId={travelerId}
          navigationState={{ returnTo: "timeline" }}
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

function renderDocuments(travelers: Traveler[] = []) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EventDocuments item={item} canEdit travelers={travelers} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("timeline primary document shortcut", () => {
  beforeEach(() => {
    mocks.listEventDocumentLinks.mockReset().mockResolvedValue([]);
    mocks.listVaultDocuments.mockReset().mockResolvedValue([]);
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
    mocks.listEventDocumentLinks.mockReset().mockResolvedValue([]);
    mocks.listVaultDocuments.mockReset().mockResolvedValue([]);
    mocks.reorderEventDocuments.mockReset().mockResolvedValue(undefined);
  });

  it("uses a compact horizontal tablet row without hiding a long document name", async () => {
    const longTitle =
      "Universal Studios and Oceanarium family activity booking confirmation for everyone";
    mocks.listEventDocumentLinks.mockResolvedValue([
      link(document({ id: "long-document", title: longTitle }), 0)
    ]);

    renderDocuments();

    const title = await screen.findByText(longTitle);
    expect(title).toHaveClass("break-words", "[overflow-wrap:anywhere]");
    expect(title).not.toHaveClass("truncate");
    const documentLink = title.closest("a");
    expect(documentLink?.parentElement).toHaveClass("flex-col", "sm:flex-row", "overflow-hidden");
    expect(documentLink).toHaveClass("py-2", "sm:items-center");

    const visibility = screen.getByLabelText("Visible to all signed-in trip members");
    const detailsAndActions = visibility.parentElement?.parentElement;
    expect(detailsAndActions).toHaveClass("border-t", "sm:border-l", "sm:border-t-0");
    expect(detailsAndActions).toHaveTextContent("Ticket");
    expect(detailsAndActions).toHaveTextContent("Trip members");

    const actions = screen.getByRole("group", { name: `Actions for ${longTitle}` });
    expect(actions.parentElement).toBe(detailsAndActions);
    const earlier = screen.getByRole("button", { name: `Move ${longTitle} earlier` });
    const later = screen.getByRole("button", { name: `Move ${longTitle} later` });
    expect(earlier).toBeDisabled();
    expect(later).toBeDisabled();
    expect(earlier.parentElement).toHaveClass("sm:flex-col", "sm:divide-y");
    expect(earlier).toHaveClass("sm:flex-1", "sm:min-h-6");
    expect(screen.getByRole("button", { name: `Unlink ${longTitle}` })).toBeInTheDocument();
  });

  it("keeps sequencing controls working when multiple documents are attached", async () => {
    const firstTitle = "Bus ticket";
    const secondTitle = "Hotel voucher";
    mocks.listEventDocumentLinks.mockResolvedValue([
      link(document({ id: "bus-ticket", title: firstTitle }), 0),
      link(document({ id: "hotel-voucher", title: secondTitle }), 1)
    ]);

    const user = userEvent.setup();
    renderDocuments();

    expect(
      await screen.findByRole("button", { name: `Move ${firstTitle} earlier` })
    ).toBeDisabled();
    const moveFirstLater = screen.getByRole("button", { name: `Move ${firstTitle} later` });
    expect(moveFirstLater).toBeEnabled();
    expect(screen.getByRole("button", { name: `Move ${secondTitle} earlier` })).toBeEnabled();
    expect(screen.getByRole("button", { name: `Move ${secondTitle} later` })).toBeDisabled();

    await user.click(moveFirstLater);

    await waitFor(() =>
      expect(mocks.reorderEventDocuments).toHaveBeenCalledWith(item.id, [
        "hotel-voucher",
        "bus-ticket"
      ])
    );
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
    mocks.listEventDocumentLinks.mockResolvedValue([link(shared, 0), link(asha, 1), link(ravi, 2)]);

    renderDocuments([traveler("asha", "Asha Singh"), traveler("ravi", "Ravi Singh")]);

    expect(
      within(await screen.findByRole("region", { name: "Everyone" })).getByText(
        "Shared ferry confirmation"
      )
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Asha Singh" })).getByText("Asha ferry ticket")
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Ravi Singh" })).getByText("Ravi ferry ticket")
    ).toBeInTheDocument();
  });
});
