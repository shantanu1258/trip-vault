import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../trips/types";
import type { AccountDocumentUpload, Traveler } from "./types";

const mocks = vi.hoisted(() => ({
  listTrips: vi.fn(),
  listAccountDocumentUploads: vi.fn(),
  listTravelers: vi.fn(),
  stageAccountDocument: vi.fn(),
  associateAccountDocument: vi.fn(),
  retryAccountDocumentUpload: vi.fn(),
  deleteAccountDocumentUpload: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({
  ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section>
}));
vi.mock("../trips/api", () => ({ listTrips: mocks.listTrips }));
vi.mock("./api", () => ({
  listAccountDocumentUploads: mocks.listAccountDocumentUploads,
  listTravelers: mocks.listTravelers,
  stageAccountDocument: mocks.stageAccountDocument,
  associateAccountDocument: mocks.associateAccountDocument,
  retryAccountDocumentUpload: mocks.retryAccountDocumentUpload,
  deleteAccountDocumentUpload: mocks.deleteAccountDocumentUpload
}));

import { DocumentInboxPanel } from "./DocumentInboxPanel";

const trip: Trip = {
  id: "trip-1",
  title: "Autumn trip",
  destination_summary: "Dubai",
  start_date: "2026-09-26",
  end_date: "2026-10-02",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z"
};

const upload: AccountDocumentUpload = {
  id: "upload-1",
  owner_id: "account-1",
  storage_path: "account-1/upload-1/boarding-pass.pdf",
  original_filename: "boarding-pass.pdf",
  mime_type: "application/pdf",
  byte_size: 42,
  sha256: "a".repeat(64),
  associated_document_id: null,
  created_at: "2026-09-13T10:00:00Z",
  updated_at: "2026-09-13T10:00:00Z",
  sync_state: "synced"
};

const traveler: Traveler = {
  id: "traveler-1",
  trip_id: trip.id,
  display_name: "Ravi",
  is_minor: false,
  created_at: "2026-09-01T00:00:00Z"
};

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><DocumentInboxPanel /></QueryClientProvider>);
}

describe("private document inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTrips.mockResolvedValue([trip]);
    mocks.listAccountDocumentUploads.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue([traveler]);
    mocks.stageAccountDocument.mockResolvedValue(upload);
    mocks.associateAccountDocument.mockResolvedValue({ id: "document-1" });
  });

  it("accepts a file without requiring trip metadata", async () => {
    const user = userEvent.setup();
    renderPanel();
    const file = new File(["%PDF-test"], "boarding-pass.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("PDF or image under 5 MB"), file);
    await user.click(screen.getByRole("button", { name: /save privately/i }));

    await waitFor(() => expect(mocks.stageAccountDocument).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/file saved to your private inbox/i)).toBeInTheDocument();
  });

  it("associates an existing inbox file with private trip metadata", async () => {
    mocks.listAccountDocumentUploads.mockResolvedValue([upload]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /attach to trip/i }));
    const sheet = screen.getByLabelText("Attach uploaded file");
    await user.selectOptions(within(sheet).getByLabelText("Document type"), "boarding_pass");
    await user.click(await within(sheet).findByText("Ravi"));
    await user.click(within(sheet).getByRole("button", { name: /attach to trip/i }));

    await waitFor(() => expect(mocks.associateAccountDocument).toHaveBeenCalledWith(expect.objectContaining({
      upload,
      tripId: trip.id,
      purpose: "boarding_pass",
      assignmentMode: "selected",
      travelerIds: [traveler.id],
      visibility: "private"
    })));
  });
});
