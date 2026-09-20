import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
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
        <Link to="/receive-share?error=unavailable">Another failed share</Link>
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
  expect(screen.getByRole("button", { name: /ticket\.pdf/ })).toBeInTheDocument();
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

it("explains a missing handoff beside the picker instead of silently showing an empty upload form", async () => {
  setup("/receive-share");
  expect(await screen.findByRole("alert")).toHaveTextContent("opened without an attached file");
  expect(screen.getByRole("heading", { name: "Save shared document" })).toBeInTheDocument();
  expect(mocks.receive).not.toHaveBeenCalled();
  const file = new File(["%PDF-test"], "chosen.pdf", { type: "application/pdf" });
  await userEvent.upload(screen.getByLabelText("PDF or image under 5 MB"), file);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /chosen\.pdf/ })).toBeInTheDocument();
});

it("does not keep a previous attachment when a later share fails in the same screen", async () => {
  mocks.receive.mockResolvedValue(
    new File(["%PDF-test"], "first.pdf", { type: "application/pdf" })
  );
  setup("/receive-share?id=first-id");
  await screen.findByRole("button", { name: /first\.pdf/ });
  await userEvent.click(screen.getByRole("link", { name: "Another failed share" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("shared file could not be received");
  expect(screen.queryByRole("button", { name: /first\.pdf/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Document name")).toHaveValue("");
  expect(mocks.stage).not.toHaveBeenCalled();
});
