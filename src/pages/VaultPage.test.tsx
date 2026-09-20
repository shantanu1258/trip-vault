import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listVaultDocuments: vi.fn(),
  listArchivedVaultDocuments: vi.fn(),
  restoreDocument: vi.fn()
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <>{children}</>
}));
vi.mock("../features/workspace/api", () => ({
  listVaultDocuments: mocks.listVaultDocuments,
  listArchivedVaultDocuments: mocks.listArchivedVaultDocuments,
  restoreDocument: mocks.restoreDocument
}));

import { VaultPage } from "./VaultPage";

describe("VaultPage document list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.listArchivedVaultDocuments.mockResolvedValue([]);
    mocks.restoreDocument.mockResolvedValue(undefined);
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
  });
});
