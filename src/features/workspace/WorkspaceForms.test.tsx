import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../trips/types";
import type { Traveler } from "./types";

const mocks = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  clearDraft: vi.fn(),
  listInvitations: vi.fn(),
  listAssociatedAccounts: vi.fn(),
  createTripMembershipOffer: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../../lib/forms/useFormDraft", () => ({ useFormDraft: () => ({ formRef: { current: null }, clearDraft: mocks.clearDraft }) }));
vi.mock("./api", () => ({
  DuplicateDocumentError: class DuplicateDocumentError extends Error { existingDocumentId = "existing"; },
  uploadDocument: mocks.uploadDocument,
  listInvitations: mocks.listInvitations,
  listAssociatedAccounts: mocks.listAssociatedAccounts,
  createTripMembershipOffer: mocks.createTripMembershipOffer,
  createInvitation: mocks.createInvitation,
  revokeInvitation: mocks.revokeInvitation
}));

import { ShareTripForm, UploadDocumentForm } from "./WorkspaceForms";

const trip: Trip = {
  id: "trip-1",
  title: "Autumn trip",
  destination_summary: "Dubai",
  start_date: "2026-09-26",
  end_date: "2026-10-02",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const travelers: Traveler[] = [
  { id: "asha", trip_id: trip.id, display_name: "Asha", is_minor: false, created_at: "" },
  { id: "ravi", trip_id: trip.id, display_name: "Ravi", is_minor: false, created_at: "" }
];

describe("Upload document flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.uploadDocument.mockResolvedValue({ id: "document-1", sync_state: "synced" });
    mocks.listInvitations.mockResolvedValue([]);
    mocks.listAssociatedAccounts.mockResolvedValue([{ user_id: "account-ravi", display_name: "Ravi Singh" }]);
    mocks.createTripMembershipOffer.mockResolvedValue("offer-1");
  });

  it("offers a later trip to a known account without creating a new code", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><ShareTripForm trip={trip} travelers={travelers} onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Known account" }));
    await screen.findByRole("option", { name: "Ravi Singh" });
    await user.selectOptions(screen.getByLabelText("Previously associated account"), "account-ravi");
    await user.selectOptions(screen.getByLabelText("Which traveler are they?"), "ravi");
    await user.selectOptions(screen.getByLabelText("App access"), "editor");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(mocks.createTripMembershipOffer).toHaveBeenCalledWith({ tripId: trip.id, userId: "account-ravi", targetType: "traveler", travelerId: "ravi", role: "editor" }));
    expect(screen.getByText(/Ravi Singh can now accept Autumn trip from Home/)).toBeInTheDocument();
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("derives the Vault name from purpose and traveler while preserving the original file", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><UploadDocumentForm trip={trip} travelers={travelers} preferredTravelerId="ravi" flightLegId="flight-1" contextTitle="Flight to Dubai" onClose={onClose} /></QueryClientProvider></MemoryRouter>);

    await user.selectOptions(screen.getByLabelText("Document type"), "boarding_pass");
    expect(screen.getByText("Boarding pass · Ravi · Flight to Dubai")).toBeInTheDocument();
    const file = new window.File(["%PDF-test"], "scan-from-phone.pdf", { type: "application/pdf" });
    const fileInput = screen.getByLabelText<HTMLInputElement>("File");
    await user.upload(fileInput, file);
    expect(fileInput.files?.[0]).toBe(file);
    expect(screen.getByText(/Selected original: scan-from-phone\.pdf/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      title: "Boarding pass · Ravi · Flight to Dubai",
      purpose: "boarding_pass",
      assignmentMode: "selected",
      travelerIds: ["ravi"],
      flightLegId: "flight-1",
      file
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a custom name while retaining the derived context", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><UploadDocumentForm trip={trip} travelers={travelers} preferredTravelerId="asha" flightLegId="flight-1" contextTitle="Flight to Dubai" onClose={vi.fn()} /></QueryClientProvider></MemoryRouter>);
    await user.click(screen.getByText("Traveler(s)"));
    await user.type(screen.getByLabelText("Document name (optional)"), "Asha mobile boarding pass");
    expect(screen.getByText("Asha mobile boarding pass")).toBeInTheDocument();
    expect(screen.getByText(/Trip context: Flight ticket · Asha · Flight to Dubai/)).toBeInTheDocument();
  });
});
