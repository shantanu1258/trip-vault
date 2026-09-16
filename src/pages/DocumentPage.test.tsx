import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tripChildNavigationState } from "../features/trips/navigation";

const mocks = vi.hoisted(() => ({
  getVaultDocument: vi.fn(),
  listMembers: vi.fn(),
  listTravelers: vi.fn(),
  listDocumentVersions: vi.fn(),
  listDocumentAccessUserIds: vi.fn(),
  updateDocumentDetails: vi.fn(),
  updateDocumentVisibility: vi.fn(),
  localProfileId: vi.fn(),
  readOfflineFile: vi.fn()
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../components/DocumentPreview", () => ({
  DocumentPreview: ({ filename, mimeType }: { filename: string; mimeType: string }) => <div data-testid="document-preview">{filename} · {mimeType}</div>
}));
vi.mock("../components/ModalSheet", () => ({ ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => <section aria-label={title}>{children}</section> }));
vi.mock("../features/sync/localSync", () => ({ localProfileId: mocks.localProfileId }));
vi.mock("../features/workspace/api", () => ({
  getVaultDocument: mocks.getVaultDocument,
  listMembers: mocks.listMembers,
  listTravelers: mocks.listTravelers,
  listDocumentVersions: mocks.listDocumentVersions,
  listDocumentAccessUserIds: mocks.listDocumentAccessUserIds,
  updateDocumentDetails: mocks.updateDocumentDetails,
  updateDocumentVisibility: mocks.updateDocumentVisibility,
  archiveDocument: vi.fn(),
  downloadDocumentVersion: vi.fn(),
  replaceDocumentVersion: vi.fn()
}));
vi.mock("../lib/storage/offlineFiles", () => ({
  readOfflineFile: mocks.readOfflineFile,
  removeDocumentOfflineCopy: vi.fn(),
  storeOfflineFile: vi.fn()
}));

import { DocumentPage } from "./DocumentPage";

describe("DocumentPage", () => {
  const longTitle = "Other booking confirmation · Ankita · Some Place to Some Place with a deliberately long generated title";

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:ticket") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    mocks.localProfileId.mockResolvedValue("user-1");
    mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner", display_name: "Owner" }]);
    mocks.listTravelers.mockResolvedValue([
      { id: "traveler-1", trip_id: "trip-1", display_name: "Ankita", is_minor: false, created_at: "" },
      { id: "traveler-2", trip_id: "trip-1", display_name: "Shantanu", is_minor: false, created_at: "" }
    ]);
    mocks.listDocumentVersions.mockResolvedValue([]);
    mocks.listDocumentAccessUserIds.mockResolvedValue([]);
    mocks.updateDocumentDetails.mockImplementation(async ({ document, title, assignmentMode, travelerIds }) => ({ ...document, title, assignment_mode: assignmentMode, traveler_ids: travelerIds }));
    mocks.updateDocumentVisibility.mockResolvedValue(undefined);
    mocks.readOfflineFile.mockResolvedValue(new Blob(["%PDF-test"], { type: "application/pdf" }));
    mocks.getVaultDocument.mockResolvedValue({
      id: "document-1",
      trip_id: "trip-1",
      booking_id: null,
      flight_leg_id: null,
      traveler_id: null,
      assignment_mode: "selected",
      traveler_ids: ["traveler-1"],
      title: longTitle,
      category: "visa",
      purpose: "visa",
      short_label: null,
      visibility: "trip",
      uploaded_by: "user-1",
      current_version_id: "version-1",
      updated_at: "2026-09-14T00:00:00Z",
      current_version: {
        id: "version-1",
        storage_path: "trip-1/document-1/visa.pdf",
        original_filename: "visa.pdf",
        mime_type: "application/octet-stream",
        byte_size: 100,
        sha256: "a".repeat(64),
        version_number: 1,
        created_at: "2026-09-14T00:00:00Z"
      }
    });
  });

  it("loads the local file into the in-app preview and keeps clear Open and Info actions", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<MemoryRouter initialEntries={[{ pathname: "/trips/trip-1/documents/document-1", state: tripChildNavigationState(null, "trip-1", "details") }]}><QueryClientProvider client={client}><Routes><Route path="/trips/:tripId/documents/:documentId" element={<DocumentPage />} /></Routes></QueryClientProvider></MemoryRouter>);

    expect(await screen.findByTestId("document-preview")).toHaveTextContent("visa.pdf · application/octet-stream");
    const title = screen.getByRole("heading", { name: longTitle });
    expect(title).toHaveClass("whitespace-normal", "break-words", "[overflow-wrap:anywhere]");
    expect(title).not.toHaveClass("truncate");
    expect(screen.getByLabelText("Visible to all signed-in trip members")).toHaveTextContent("Trip members");
    expect(screen.getByRole("link", { name: "Back to trip" })).toHaveAttribute("href", "/trips/trip-1?view=details");
    expect(screen.getByRole("link", { name: "Open with device viewer" })).toHaveAttribute("href", "blob:ticket");
    const info = screen.getByRole("button", { name: "Document information and actions" });
    expect(info).toHaveClass("size-11", "rounded-full", "place-items-center");
    await user.click(info);
    expect(screen.getByRole("region", { name: "Document information" })).toBeInTheDocument();
    expect(screen.getByText("Visible to all signed-in trip members")).toBeInTheDocument();
  });

  it("lets an owner change an existing document to selected-member access", async () => {
    const user = userEvent.setup();
    mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner", display_name: "Owner" }, { user_id: "user-2", role: "viewer", display_name: "Friend" }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<MemoryRouter initialEntries={["/trips/trip-1/documents/document-1"]}><QueryClientProvider client={client}><Routes><Route path="/trips/:tripId/documents/:documentId" element={<DocumentPage />} /></Routes></QueryClientProvider></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Document information and actions" }));
    await user.click(await screen.findByRole("button", { name: "Change" }));
    await user.selectOptions(screen.getByLabelText("Visibility"), "selected_members");
    await user.click(screen.getByRole("checkbox", { name: "Friend" }));
    await user.click(screen.getByRole("button", { name: "Save visibility" }));

    expect(mocks.updateDocumentVisibility).toHaveBeenCalledWith({ documentId: "document-1", visibility: "selected_members", selectedUserIds: ["user-2"] });
  });

  it("lets a document manager edit the generated title and traveler assignment", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    render(<MemoryRouter initialEntries={["/trips/trip-1/documents/document-1"]}><QueryClientProvider client={client}><Routes><Route path="/trips/:tripId/documents/:documentId" element={<DocumentPage />} /></Routes></QueryClientProvider></MemoryRouter>);

    await user.click(await screen.findByRole("button", { name: "Document information and actions" }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const title = screen.getByLabelText("Title");
    await user.clear(title);
    await user.type(title, "Dubai flight tickets");
    await user.click(screen.getByRole("checkbox", { name: "Shantanu" }));
    await user.click(screen.getByRole("button", { name: "Save document details" }));

    expect(mocks.updateDocumentDetails).toHaveBeenCalledWith(expect.objectContaining({
      title: "Dubai flight tickets",
      assignmentMode: "selected",
      travelerIds: ["traveler-1", "traveler-2"]
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Document title and travelers updated");
  });
});
