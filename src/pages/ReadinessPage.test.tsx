import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../features/trips/types";
import { tripChildNavigationState } from "../features/trips/navigation";
import type { Requirement } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  archiveRequirement: vi.fn(),
  getTrip: vi.fn(),
  listItinerary: vi.fn(),
  listMembers: vi.fn(),
  listRequirements: vi.fn(),
  listTravelers: vi.fn(),
  listTripRequirementAssignees: vi.fn(),
  updateRequirementStatus: vi.fn()
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../features/sync/localSync", () => ({ localProfileId: vi.fn().mockResolvedValue("user-1") }));
vi.mock("../features/trips/api", () => ({ getTrip: mocks.getTrip, listItinerary: mocks.listItinerary }));
vi.mock("../features/workspace/travelerFocus", () => ({ readTravelerFocus: () => null }));
vi.mock("../features/workspace/WorkspaceForms", () => ({
  AddRequirementForm: ({ requirement, onClose }: { requirement?: Requirement; onClose: () => void }) => (
    <section aria-label={requirement ? "Edit task" : "Add task"}>
      {requirement?.title}
      <button type="button" onClick={onClose}>Close form</button>
    </section>
  )
}));
vi.mock("../features/workspace/api", () => ({
  archiveRequirement: mocks.archiveRequirement,
  listMembers: mocks.listMembers,
  listRequirements: mocks.listRequirements,
  listTravelers: mocks.listTravelers,
  listTripRequirementAssignees: mocks.listTripRequirementAssignees,
  updateRequirementStatus: mocks.updateRequirementStatus
}));

import { ReadinessPage } from "./ReadinessPage";

const trip: Trip = {
  id: "trip-1",
  title: "Dubai journey",
  destination_summary: "Dubai",
  start_date: "2026-09-28",
  end_date: "2026-09-30",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const requirement: Requirement = {
  id: "requirement-1",
  trip_id: trip.id,
  type: "passport",
  title: "Passport ready",
  destination_country_code: null,
  visa_type: null,
  status: "to_check",
  due_date: "2026-09-20",
  issued_on: null,
  expires_on: null,
  validity_buffer_days: null,
  official_guidance_url: null,
  guidance_checked_at: null,
  linked_document_id: null,
  notes: "Check validity before departure."
};

function renderPage(initialEntry: string | { pathname: string; state: unknown } = "/trips/trip-1/readiness") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/trips/:tripId/readiness" element={<ReadinessPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("readiness checklist interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listRequirements.mockResolvedValue([requirement]);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner", participation_type: "traveler", joined_at: null, display_name: "Owner" }]);
    mocks.listTripRequirementAssignees.mockResolvedValue([]);
    mocks.updateRequirementStatus.mockResolvedValue(undefined);
    mocks.archiveRequirement.mockResolvedValue(undefined);
  });

  it("checks a task off without opening edit and keeps edit and archive separate", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    const editTask = await screen.findByRole("button", { name: "Edit Passport ready" });
    expect(screen.getByText(/Due Sep 20, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Check validity before departure.")).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Mark as done: Passport ready" }));
    await waitFor(() => expect(mocks.updateRequirementStatus).toHaveBeenCalledWith("requirement-1", "complete", "trip-1"));
    expect(screen.getByRole("status")).toHaveTextContent("marked done");
    expect(screen.queryByRole("region", { name: "Edit task" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive Passport ready" }));
    await waitFor(() => expect(mocks.archiveRequirement).toHaveBeenCalledWith(requirement));
    expect(confirm).toHaveBeenCalledWith("Archive Passport ready?");
    expect(screen.queryByRole("region", { name: "Edit task" })).not.toBeInTheDocument();

    await user.click(editTask);
    expect(await screen.findByRole("region", { name: "Edit task" })).toHaveTextContent("Passport ready");
  });

  it("opens a simple add-task flow from the checklist header", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("0 of 1 done")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByRole("region", { name: "Add task" })).toBeInTheDocument();
  });

  it("omits due date and notes when a task does not have them", async () => {
    mocks.listRequirements.mockResolvedValue([{ ...requirement, id: "requirement-2", title: "Buy adapter", due_date: null, notes: null }]);
    renderPage();

    const title = await screen.findByText("Buy adapter");
    const task = title.closest("li");
    expect(task).not.toBeNull();
    expect(within(task!).queryByText(/^Due /)).not.toBeInTheDocument();
    expect(within(task!).getByText("Not done")).toBeInTheDocument();
  });

  it("returns to the source Trip details tab", async () => {
    renderPage({ pathname: "/trips/trip-1/readiness", state: tripChildNavigationState(null, "trip-1", "details") });

    expect(await screen.findByRole("link", { name: "Back to trip" })).toHaveAttribute("href", "/trips/trip-1?view=details");
  });
});
