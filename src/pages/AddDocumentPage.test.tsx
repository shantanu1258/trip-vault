import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  stage: vi.fn(),
  receive: vi.fn(),
  discard: vi.fn(),
  form: vi.fn()
}));
vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("../features/trips/api", () => ({
  listTrips: async () => [{ id: "trip-1", title: "Holiday" }]
}));
vi.mock("../features/sync/localSync", () => ({ localProfileId: async () => "owner" }));
vi.mock("../features/workspace/api", () => ({
  stageAccountDocument: mocks.stage,
  listMembers: async () => [{ user_id: "owner", role: "owner" }],
  listTravelers: async () => []
}));
vi.mock("../features/workspace/WorkspaceForms", () => ({
  UploadDocumentForm: (props: unknown) => {
    mocks.form(props);
    return <div>Trip document review</div>;
  }
}));
vi.mock("../lib/pwa/incomingShare", () => ({
  readIncomingShare: mocks.receive,
  discardIncomingShare: mocks.discard
}));
import { AddDocumentPage } from "./AddDocumentPage";
function setup(path = "/vault/add") {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/vault" element={<p>Saved in Vault</p>} />
          <Route path="*" element={<AddDocumentPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.stage.mockResolvedValue({ stored_at: "now" });
});

it("saves a personal identity file without a trip, only after explicit confirmation", async () => {
  const file = new File(["%PDF-file"], "passport.pdf", { type: "application/pdf" });
  setup();
  await userEvent.upload(screen.getByLabelText("PDF or image under 5 MB"), file);
  await userEvent.selectOptions(screen.getByLabelText("Document type"), "passport");
  expect(mocks.stage).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole("button", { name: "Save privately" }));
  await screen.findByText("Saved in Vault");
  expect(mocks.stage).toHaveBeenCalledWith(file, undefined, {
    title: "passport.pdf",
    kind: "passport",
    label: ""
  });
});

it("reviews received files using existing trip fields with private visibility, and clears a cancelled share", async () => {
  const file = new File(["%PDF-file"], "ticket.pdf", { type: "application/pdf" });
  mocks.receive.mockResolvedValue(file);
  setup("/receive-share?id=shared-id");
  await waitFor(() => expect(screen.getByLabelText("Document name")).toHaveValue("ticket.pdf"));
  expect(mocks.stage).not.toHaveBeenCalled();
  await userEvent.selectOptions(screen.getByLabelText("Save to"), "trip");
  await screen.findByRole("option", { name: "Holiday" });
  await userEvent.selectOptions(screen.getByLabelText("Trip"), "trip-1");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Review trip document" })).toBeEnabled()
  );
  await userEvent.click(screen.getByRole("button", { name: "Review trip document" }));
  expect(mocks.form).toHaveBeenCalledWith(
    expect.objectContaining({
      initialFile: file,
      initialFileContext: "shared",
      initialVisibility: "private",
      privateOnly: false
    })
  );
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  await screen.findByText("Saved in Vault");
  expect(mocks.discard).toHaveBeenCalledWith("shared-id");
  expect(mocks.stage).not.toHaveBeenCalled();
});
