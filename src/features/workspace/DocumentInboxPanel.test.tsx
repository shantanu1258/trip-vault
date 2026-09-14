import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../trips/types";
import type { AccountDocumentUpload, Traveler, TripMember } from "./types";

const mocks = vi.hoisted(() => ({
  listTrips: vi.fn(),
  listAccountDocumentUploads: vi.fn(),
  listMembers: vi.fn(),
  listTravelers: vi.fn(),
  stageAccountDocument: vi.fn(),
  associateAccountDocument: vi.fn(),
  retryAccountDocumentUpload: vi.fn(),
  deleteAccountDocumentUpload: vi.fn(),
  localProfileId: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({
  ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section>
}));
vi.mock("../trips/api", () => ({ listTrips: mocks.listTrips }));
vi.mock("../sync/localSync", () => ({ localProfileId: mocks.localProfileId }));
vi.mock("./api", () => ({
  listAccountDocumentUploads: mocks.listAccountDocumentUploads,
  listMembers: mocks.listMembers,
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
  stored_at: "2026-09-13T10:01:00Z",
  created_at: "2026-09-13T10:00:00Z",
  updated_at: "2026-09-13T10:00:00Z",
  sync_state: "synced",
  can_retry: false
};

const traveler: Traveler = {
  id: "traveler-1",
  trip_id: trip.id,
  display_name: "Ravi",
  is_minor: false,
  created_at: "2026-09-01T00:00:00Z"
};

const member: TripMember = {
  user_id: "account-2",
  role: "editor",
  participation_type: "traveler",
  joined_at: "2026-09-01T00:00:00Z",
  display_name: "Asha"
};

const owner: TripMember = {
  user_id: "account-1",
  role: "owner",
  participation_type: "traveler",
  joined_at: "2026-09-01T00:00:00Z",
  display_name: "Owner"
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
    mocks.listMembers.mockResolvedValue([owner, member]);
    mocks.listTravelers.mockResolvedValue([traveler]);
    mocks.stageAccountDocument.mockResolvedValue(upload);
    mocks.associateAccountDocument.mockResolvedValue({ id: "document-1" });
    mocks.localProfileId.mockResolvedValue(owner.user_id);
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

  it("defaults an associated inbox file to signed-in trip members", async () => {
    mocks.listAccountDocumentUploads.mockResolvedValue([upload]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /attach to trip/i }));
    const sheet = screen.getByLabelText("Attach uploaded file");
    expect(await within(sheet).findByLabelText("Who can open it?")).toHaveValue("trip");
    await user.selectOptions(within(sheet).getByLabelText("Document type"), "boarding_pass");
    await user.click(await within(sheet).findByText("Ravi"));
    await user.click(within(sheet).getByRole("button", { name: /attach to trip/i }));

    await waitFor(() => expect(mocks.associateAccountDocument).toHaveBeenCalledWith(expect.objectContaining({
      upload,
      tripId: trip.id,
      purpose: "boarding_pass",
      assignmentMode: "selected",
      travelerIds: [traveler.id],
      visibility: "trip",
      selectedUserIds: []
    })));
  });

  it("allows an associated inbox file to remain private", async () => {
    mocks.listAccountDocumentUploads.mockResolvedValue([upload]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /attach to trip/i }));
    const sheet = screen.getByLabelText("Attach uploaded file");
    await user.selectOptions(await within(sheet).findByLabelText("Who can open it?"), "private");
    await user.click(within(sheet).getByRole("button", { name: /attach to trip/i }));

    await waitFor(() => expect(mocks.associateAccountDocument).toHaveBeenCalledWith(expect.objectContaining({
      upload,
      tripId: trip.id,
      visibility: "private",
      selectedUserIds: []
    })));
  });

  it("validates and associates selected signed-in members", async () => {
    mocks.listAccountDocumentUploads.mockResolvedValue([upload]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /attach to trip/i }));
    const sheet = screen.getByLabelText("Attach uploaded file");
    await user.selectOptions(await within(sheet).findByLabelText("Who can open it?"), "selected_members");
    const memberCheckbox = await within(sheet).findByRole("checkbox", { name: member.display_name });
    await user.click(within(sheet).getByRole("button", { name: /attach to trip/i }));

    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Choose at least one signed-in member.");
    expect(mocks.associateAccountDocument).not.toHaveBeenCalled();

    await user.click(memberCheckbox);
    await user.click(within(sheet).getByRole("button", { name: /attach to trip/i }));

    await waitFor(() => expect(mocks.associateAccountDocument).toHaveBeenCalledWith(expect.objectContaining({
      upload,
      tripId: trip.id,
      visibility: "selected_members",
      selectedUserIds: [member.user_id]
    })));
  });

  it("forces a viewer association to remain private", async () => {
    mocks.listAccountDocumentUploads.mockResolvedValue([upload]);
    mocks.listMembers.mockResolvedValue([{ ...owner, role: "viewer" }, member]);
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: /attach to trip/i }));
    const sheet = screen.getByLabelText("Attach uploaded file");
    expect(await within(sheet).findByText(/trip role does not allow sharing/i)).toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Who can open it?")).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: /attach to trip/i }));

    await waitFor(() => expect(mocks.associateAccountDocument).toHaveBeenCalledWith(expect.objectContaining({
      upload,
      tripId: trip.id,
      visibility: "private",
      selectedUserIds: []
    })));
  });

  it("does not offer association for a metadata row whose cloud file is missing", async () => {
    mocks.listAccountDocumentUploads.mockResolvedValue([{
      ...upload,
      stored_at: null,
      sync_state: "queued",
      sync_error: "storage_missing",
      can_retry: false,
      can_verify: true
    }]);
    renderPanel();

    expect(await screen.findByText(/cloud file missing/i)).toBeInTheDocument();
    expect(screen.getByText(/delete this unfinished entry and select the file again here/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /attach to trip/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry cloud/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /check cloud/i })).toBeInTheDocument();
  });

  it("reports a queued device copy without claiming it reached the cloud", async () => {
    mocks.stageAccountDocument.mockResolvedValue({ ...upload, stored_at: null, sync_state: "queued", sync_error: "permission", can_retry: true });
    const user = userEvent.setup();
    renderPanel();
    const file = new File(["%PDF-test"], "boarding-pass.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("PDF or image under 5 MB"), file);
    await user.click(screen.getByRole("button", { name: /save privately/i }));

    expect(await screen.findByText(/saved on this device, but its cloud upload needs attention/i)).toBeInTheDocument();
  });
});
