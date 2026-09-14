import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem } from "../trips/types";
import type { EventDocumentLink, VaultDocument } from "./types";

const mocks = vi.hoisted(() => ({
  listEventDocumentLinks: vi.fn(),
  listVaultDocuments: vi.fn()
}));

vi.mock("./api", () => ({
  attachDocumentsToEvent: vi.fn(),
  listEventDocumentLinks: mocks.listEventDocumentLinks,
  listVaultDocuments: mocks.listVaultDocuments,
  reorderEventDocuments: vi.fn(),
  unlinkDocumentFromEvent: vi.fn()
}));

import { EventDocumentShortcut } from "./EventDocuments";

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
  return { itinerary_item_id: item.id, document_id: value.id, label: null, sort_order: sortOrder, document: value };
}

function renderShortcut(travelerId?: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><MemoryRouter><EventDocumentShortcut item={item} travelerId={travelerId} navigationState={{ returnTo: "timeline" }} /></MemoryRouter></QueryClientProvider>);
}

describe("timeline primary document shortcut", () => {
  beforeEach(() => {
    mocks.listEventDocumentLinks.mockReset().mockResolvedValue([]);
    mocks.listVaultDocuments.mockReset().mockResolvedValue([]);
  });

  it("labels and opens the first explicitly related document visible to the focused traveler", async () => {
    const otherTraveler = document({ id: "other-pass", title: "Asha boarding pass", purpose: "boarding_pass", assignment_mode: "selected", traveler_id: "asha", traveler_ids: ["asha"] });
    const focusedVisa = document({ id: "ravi-visa", booking_id: null, title: "Ravi visa", purpose: "visa", assignment_mode: "selected", traveler_id: "ravi", traveler_ids: ["ravi"], short_label: "UAE" });
    mocks.listEventDocumentLinks.mockResolvedValue([link(otherTraveler, 0), link(focusedVisa, 1)]);

    renderShortcut("ravi");

    const shortcut = await screen.findByRole("link", { name: "Open Visa: Ravi visa" });
    expect(shortcut).toHaveAttribute("href", "/trips/trip-1/documents/ravi-visa");
    expect(shortcut).toHaveTextContent("Open Visa · UAE");
    expect(shortcut).toContainElement(screen.getByLabelText("Visible to all signed-in trip members"));
    expect(shortcut).toHaveTextContent("Trip members");
    expect(screen.queryByRole("link", { name: /Asha boarding pass/ })).not.toBeInTheDocument();
  });

  it("falls back to a traveler-visible booking document when no explicit link is visible", async () => {
    const hidden = document({ id: "hidden", booking_id: null, assignment_mode: "selected", traveler_id: "asha", traveler_ids: ["asha"] });
    const bookingTicket = document({ id: "booking-ticket", title: "Shared operator ticket" });
    mocks.listEventDocumentLinks.mockResolvedValue([link(hidden, 0)]);
    mocks.listVaultDocuments.mockResolvedValue([bookingTicket]);

    renderShortcut("ravi");

    expect(await screen.findByRole("link", { name: "Open Ticket: Shared operator ticket" })).toHaveAttribute("href", "/trips/trip-1/documents/booking-ticket");
  });
});
