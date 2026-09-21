import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
vi.mock("../../components/ConfirmDialogProvider", () => ({ useConfirmDialog: () => vi.fn() }));
vi.mock("./api", () => ({
  listAccountDocumentUploads: async () => [
    {
      id: "passport",
      owner_id: "me",
      personal_title: "My passport",
      personal_kind: "passport",
      stored_at: "now"
    }
  ],
  openPersonalDocument: async () => {
    throw new Error("File unavailable for this test");
  },
  deleteAccountDocumentUpload: vi.fn(),
  retryAccountDocumentUpload: vi.fn()
}));
import { PersonalDocuments } from "./PersonalDocuments";
it("keeps a personal document preview inside the Vault without a Back to trip action", async () => {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={["/vault?section=personal"]}>
        <PersonalDocuments />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await userEvent.click(await screen.findByRole("button", { name: /^My passport/ }));
  const dialog = screen.getByRole("dialog", { name: "My passport" });
  expect(within(dialog).getByText("Personal document · Only me")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Back to trip" })).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Back" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^My passport/ })).toBeInTheDocument();
});
