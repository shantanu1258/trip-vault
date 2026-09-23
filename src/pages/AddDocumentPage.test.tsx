import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  stage: vi.fn(),
  receive: vi.fn(),
  discard: vi.fn(),
  form: vi.fn(),
  trips: vi.fn(),
  itinerary: vi.fn(),
  reminders: vi.fn(),
  requirements: vi.fn(),
  attach: vi.fn()
}));
vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("../features/trips/api", () => ({
  listTrips: mocks.trips,
  listItinerary: mocks.itinerary,
  listReminders: mocks.reminders
}));
vi.mock("../features/sync/localSync", () => ({ localProfileId: async () => "owner" }));
vi.mock("../features/workspace/api", () => ({
  stageAccountDocument: mocks.stage,
  listMembers: async () => [{ user_id: "owner", role: "owner" }],
  listTravelers: async () => [{ id: "traveler-1", display_name: "Sam" }],
  listRequirements: mocks.requirements,
  listFlightLegsForTrip: async () => [{ id: "flight-1", booking_id: "booking-1" }],
  listJourneyLegsForTrip: async () => [],
  attachDocumentsToEvent: mocks.attach
}));
vi.mock("../features/workspace/WorkspaceForms", () => ({
  UploadDocumentForm: (props: { onUploaded: (id: string) => void }) => {
    mocks.form(props);
    return (
      <div>
        Trip document review
        <button onClick={() => props.onUploaded("saved-document")}>Finish upload</button>
      </div>
    );
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
  mocks.trips.mockResolvedValue([{ id: "trip-1", title: "Holiday" }]);
  mocks.itinerary.mockResolvedValue([]);
  mocks.reminders.mockResolvedValue([]);
  mocks.requirements.mockResolvedValue([]);
  mocks.attach.mockResolvedValue([]);
});

function underwayEvent() {
  return {
    id: "event-1",
    trip_id: "trip-1",
    booking_id: "booking-1",
    title: "Flight to Bali",
    event_type: "flight",
    timing_mode: "exact",
    starts_at: new Date(Date.now() - 3600000).toISOString(),
    ends_at: new Date(Date.now() + 3600000).toISOString()
  };
}

it("defaults to a trip before travel begins when its first reminder has already occurred", async () => {
  mocks.itinerary.mockResolvedValue([
    {
      ...underwayEvent(),
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 172800000).toISOString()
    }
  ]);
  mocks.reminders.mockResolvedValue([
    {
      id: "reminder-1",
      trip_id: "trip-1",
      due_at: new Date(Date.now() - 3600000).toISOString(),
      completed_at: new Date().toISOString()
    }
  ]);
  setup();
  await waitFor(() => expect(screen.getByLabelText("Trip")).toHaveValue("trip-1"));
  expect(screen.getByLabelText("Save to")).toHaveValue("trip");
  expect(mocks.reminders).toHaveBeenCalledWith(true);
  expect(screen.getByLabelText("Traveller")).toHaveValue("");
});

it("defaults to the underway trip, offers its events and retries a failed attachment without uploading twice", async () => {
  const event = underwayEvent();
  mocks.itinerary.mockResolvedValue([event]);
  mocks.attach.mockRejectedValueOnce(new Error("Connection lost")).mockResolvedValue([]);
  setup();
  await waitFor(() => expect(screen.getByLabelText("Trip")).toHaveValue("trip-1"));
  expect(screen.getByLabelText("Save to")).toHaveValue("trip");
  await waitFor(() => expect(screen.getByLabelText("Event (optional)")).toBeEnabled());
  await userEvent.selectOptions(screen.getByLabelText("Event (optional)"), "event-1");
  expect(screen.getByLabelText("Document type")).toHaveValue("boarding_pass");
  expect(screen.getByLabelText("Traveller")).toHaveValue("");
  await userEvent.upload(
    screen.getByLabelText("PDF or image under 5 MB"),
    new File(["pdf"], "pass.pdf", { type: "application/pdf" })
  );
  await userEvent.click(screen.getByRole("button", { name: "Review trip document" }));
  expect(mocks.form).toHaveBeenCalledWith(
    expect.objectContaining({
      bookingId: "booking-1",
      flightLegId: "flight-1",
      initialKind: "boarding_pass",
      assignmentPreset: { mode: "shared", travelerIds: [] },
      contextTitle: "Flight to Bali"
    })
  );
  await userEvent.click(screen.getByRole("button", { name: "Finish upload" }));
  await screen.findByText("Connection lost");
  await userEvent.click(screen.getByRole("button", { name: "Retry event link" }));
  await screen.findByText("Saved in Vault");
  expect(mocks.attach).toHaveBeenNthCalledWith(2, event, ["saved-document"]);
});

it("defaults to the latest-starting active trip and clears event, type and traveler when changing trip", async () => {
  mocks.trips.mockResolvedValue([
    { id: "trip-1", title: "Holiday" },
    { id: "trip-2", title: "Weekend" }
  ]);
  mocks.itinerary.mockImplementation(async (tripId) => [
    {
      ...underwayEvent(),
      id: `event-${tripId}`,
      trip_id: tripId,
      starts_at: new Date(Date.now() - (tripId === "trip-1" ? 7200000 : 3600000)).toISOString()
    }
  ]);
  setup();
  await waitFor(() => expect(screen.getByLabelText("Trip")).toHaveValue("trip-2"));
  await waitFor(() => expect(screen.getByLabelText("Event (optional)")).toBeEnabled());
  await userEvent.selectOptions(screen.getByLabelText("Event (optional)"), "event-trip-2");
  await userEvent.selectOptions(screen.getByLabelText("Document type"), "visa");
  await userEvent.selectOptions(screen.getByLabelText("Traveller"), "traveler-1");
  await userEvent.selectOptions(screen.getByLabelText("Trip"), "trip-1");
  expect(screen.getByLabelText("Event (optional)")).toHaveValue("");
  expect(screen.getByLabelText("Document type")).toHaveValue("other");
  expect(screen.getByLabelText("Traveller")).toHaveValue("");
});

it("carries the chosen type and traveler into review without changing visibility", async () => {
  mocks.itinerary.mockResolvedValue([underwayEvent()]);
  setup();
  await waitFor(() => expect(screen.getByLabelText("Event (optional)")).toBeEnabled());
  await userEvent.selectOptions(screen.getByLabelText("Event (optional)"), "event-1");
  await userEvent.selectOptions(screen.getByLabelText("Document type"), "visa");
  await userEvent.selectOptions(screen.getByLabelText("Traveller"), "traveler-1");
  await userEvent.upload(
    screen.getByLabelText("PDF or image under 5 MB"),
    new File(["pdf"], "visa.pdf", { type: "application/pdf" })
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Review trip document" })).toBeEnabled()
  );
  await userEvent.click(screen.getByRole("button", { name: "Review trip document" }));
  expect(mocks.form).toHaveBeenCalledWith(
    expect.objectContaining({
      initialKind: "visa",
      assignmentPreset: { mode: "selected", travelerIds: ["traveler-1"] },
      initialVisibility: "trip"
    })
  );
});

it("keeps an explicit personal destination private even during a trip", async () => {
  mocks.itinerary.mockResolvedValue([underwayEvent()]);
  setup("/vault/add?section=personal");
  await waitFor(() => expect(mocks.itinerary).toHaveBeenCalled());
  expect(screen.getByLabelText("Save to")).toHaveValue("personal");
  expect(screen.queryByLabelText("Trip")).not.toBeInTheDocument();
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

it("defaults a Vault trip upload to everyone without changing personal upload privacy", async () => {
  setup();
  const file = new File(["%PDF-file"], "trip-ticket.pdf", { type: "application/pdf" });
  await userEvent.upload(screen.getByLabelText("PDF or image under 5 MB"), file);
  await userEvent.selectOptions(screen.getByLabelText("Save to"), "trip");
  await screen.findByRole("option", { name: "Holiday" });
  await userEvent.selectOptions(screen.getByLabelText("Trip"), "trip-1");
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Review trip document" })).toBeEnabled()
  );
  await userEvent.click(screen.getByRole("button", { name: "Review trip document" }));
  expect(mocks.form).toHaveBeenCalledWith(
    expect.objectContaining({ initialVisibility: "trip", privateOnly: false })
  );
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

it.each([
  ["no_file", "without sending an attachment"],
  ["text_only", "shared text or a link"],
  ["count", "Share one document at a time"]
])("explains the %s share failure without uploading anything", async (code, explanation) => {
  setup(`/receive-share?error=${code}`);
  expect(await screen.findByRole("alert")).toHaveTextContent(explanation);
  expect(mocks.receive).not.toHaveBeenCalled();
  expect(mocks.stage).not.toHaveBeenCalled();
});
