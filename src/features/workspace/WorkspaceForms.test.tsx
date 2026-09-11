import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../trips/types";
import type { Traveler } from "./types";

const mocks = vi.hoisted(() => ({ uploadDocument: vi.fn(), clearDraft: vi.fn() }));

vi.mock("../../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../../lib/forms/useFormDraft", () => ({ useFormDraft: () => ({ formRef: { current: null }, clearDraft: mocks.clearDraft }) }));
vi.mock("./api", () => ({
  DuplicateDocumentError: class DuplicateDocumentError extends Error { existingDocumentId = "existing"; },
  uploadDocument: mocks.uploadDocument
}));

import { UploadDocumentForm } from "./WorkspaceForms";

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
  });

  it("derives the Vault name from purpose and traveler while preserving the original file", async () => {
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><QueryClientProvider client={queryClient}><UploadDocumentForm trip={trip} travelers={travelers} preferredTravelerId="ravi" flightLegId="flight-1" onClose={onClose} /></QueryClientProvider></MemoryRouter>);

    await user.selectOptions(screen.getByLabelText("Document type"), "boarding_pass");
    expect(screen.getByText("Boarding pass · Ravi")).toBeInTheDocument();
    const file = new window.File(["%PDF-test"], "scan-from-phone.pdf", { type: "application/pdf" });
    const fileInput = screen.getByLabelText<HTMLInputElement>("File");
    await user.upload(fileInput, file);
    expect(fileInput.files?.[0]).toBe(file);
    expect(screen.getByText(/Selected original: scan-from-phone\.pdf/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith(expect.objectContaining({
      title: "Boarding pass · Ravi",
      purpose: "boarding_pass",
      assignmentMode: "selected",
      travelerIds: ["ravi"],
      flightLegId: "flight-1",
      file
    })));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
