import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../features/trips/types";
import { tripChildNavigationState } from "../features/trips/navigation";
import type { Requirement } from "../features/workspace/types";
import { ConfirmDialogProvider } from "../components/ConfirmDialogProvider";

const mocks = vi.hoisted(() => ({
  archiveRequirement: vi.fn(),
  getTrip: vi.fn(),
  listItinerary: vi.fn(),
  listMembers: vi.fn(),
  listRequirements: vi.fn(),
  listTravelers: vi.fn(),
  listTripRequirementAssignees: vi.fn(),
  updateRequirementStatus: vi.fn(),
  focusedTravelerId: null as string | null
}));

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../features/sync/localSync", () => ({
  localProfileId: vi.fn().mockResolvedValue("user-1")
}));
vi.mock("../features/trips/api", () => ({
  getTrip: mocks.getTrip,
  listItinerary: mocks.listItinerary
}));
vi.mock("../features/workspace/travelerFocus", () => ({
  readTravelerFocus: () => mocks.focusedTravelerId,
  requirementMatchesTraveler: (
    requirementId: string,
    travelerId: string,
    assignees: Array<{ requirement_id: string; traveler_id: string }>
  ) => {
    const taskAssignees = assignees.filter((row) => row.requirement_id === requirementId);
    return (
      taskAssignees.length === 0 || taskAssignees.some((row) => row.traveler_id === travelerId)
    );
  },
  requirementAudienceLabel: (
    requirementId: string,
    assignees: Array<{ requirement_id: string; traveler_id: string }>,
    travelers: Array<{ id: string; display_name: string }>
  ) => {
    const names = assignees
      .filter((row) => row.requirement_id === requirementId)
      .map((row) => travelers.find((traveler) => traveler.id === row.traveler_id)?.display_name)
      .filter(Boolean);
    return names.join(", ");
  }
}));
vi.mock("../features/workspace/WorkspaceForms", () => ({
  AddRequirementForm: ({
    requirement,
    onClose
  }: {
    requirement?: Requirement;
    onClose: () => void;
  }) => (
    <section aria-label={requirement ? "Edit task" : "Add task"}>
      {requirement?.title}
      <button type="button" onClick={onClose}>
        Close form
      </button>
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

function renderPage(
  initialEntry: string | { pathname: string; state: unknown } = "/trips/trip-1/readiness"
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ConfirmDialogProvider>
        <MemoryRouter
          initialEntries={[initialEntry]}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route path="/trips/:tripId/readiness" element={<ReadinessPage />} />
          </Routes>
        </MemoryRouter>
      </ConfirmDialogProvider>
    </QueryClientProvider>
  );
}

describe("readiness checklist interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.focusedTravelerId = null;
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listRequirements.mockResolvedValue([requirement]);
    mocks.listItinerary.mockResolvedValue([]);
    mocks.listTravelers.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([
      {
        user_id: "user-1",
        role: "owner",
        participation_type: "traveler",
        joined_at: null,
        display_name: "Owner"
      }
    ]);
    mocks.listTripRequirementAssignees.mockResolvedValue([]);
    mocks.updateRequirementStatus.mockResolvedValue(undefined);
    mocks.archiveRequirement.mockResolvedValue(undefined);
  });

  it("opens task details from the row and only checks it off from the checkbox", async () => {
    const user = userEvent.setup();
    renderPage();

    const editTask = await screen.findByRole("button", { name: "Edit Passport ready" });
    expect(screen.getByText(/Due Sep 20, 2026/)).toBeInTheDocument();
    expect(screen.getByText("Check validity before departure.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View details for Passport ready" }));
    const details = screen.getByRole("dialog", { name: "Passport ready" });
    expect(within(details).getByText("Check validity before departure.")).toBeInTheDocument();
    expect(mocks.updateRequirementStatus).not.toHaveBeenCalled();
    await user.click(within(details).getByRole("button", { name: "Back" }));

    await user.click(screen.getByRole("checkbox", { name: "Mark as done: Passport ready" }));
    await waitFor(() =>
      expect(mocks.updateRequirementStatus).toHaveBeenCalledWith(
        "requirement-1",
        "complete",
        "trip-1"
      )
    );
    expect(screen.getByRole("status")).toHaveTextContent("marked done");
    expect(screen.queryByRole("region", { name: "Edit task" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive Passport ready" }));
    expect(screen.getByRole("dialog", { name: "Archive task?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(mocks.archiveRequirement).toHaveBeenCalledWith(requirement));
    expect(screen.queryByRole("region", { name: "Edit task" })).not.toBeInTheDocument();

    await user.click(editTask);
    expect(await screen.findByRole("region", { name: "Edit task" })).toHaveTextContent(
      "Passport ready"
    );
  });

  it("opens a simple add-task flow from the checklist header", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("0 of 1 done")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByRole("region", { name: "Add task" })).toBeInTheDocument();
  });

  it("shows everyone tasks plus the selected traveler's tasks and identifies their audience", async () => {
    mocks.focusedTravelerId = "asha";
    mocks.listTravelers.mockResolvedValue([
      { id: "asha", trip_id: trip.id, display_name: "Asha", is_minor: false, created_at: "" },
      { id: "ravi", trip_id: trip.id, display_name: "Ravi", is_minor: false, created_at: "" }
    ]);
    mocks.listRequirements.mockResolvedValue([
      { ...requirement, id: "everyone-task", title: "Check all passports" },
      { ...requirement, id: "asha-task", title: "Pack Asha medicine" },
      { ...requirement, id: "ravi-task", title: "Pack Ravi medicine" }
    ]);
    mocks.listTripRequirementAssignees.mockResolvedValue([
      { id: "a", requirement_id: "asha-task", traveler_id: "asha" },
      { id: "r", requirement_id: "ravi-task", traveler_id: "ravi" }
    ]);
    renderPage();

    expect(await screen.findByText("Check all passports")).toBeInTheDocument();
    expect(screen.getByText("Pack Asha medicine")).toBeInTheDocument();
    expect(screen.queryByText("Pack Ravi medicine")).not.toBeInTheDocument();
    expect(screen.getByText("Asha")).toBeInTheDocument();
  });

  it("omits due date and notes when a task does not have them", async () => {
    mocks.listRequirements.mockResolvedValue([
      { ...requirement, id: "requirement-2", title: "Buy adapter", due_date: null, notes: null }
    ]);
    renderPage();

    const title = await screen.findByText("Buy adapter");
    const task = title.closest("li");
    expect(task).not.toBeNull();
    expect(within(task!).queryByText(/^Due /)).not.toBeInTheDocument();
    expect(within(task!).getByText("Not done")).toBeInTheDocument();
  });

  it("returns to the source Trip details tab", async () => {
    renderPage({
      pathname: "/trips/trip-1/readiness",
      state: tripChildNavigationState(null, "trip-1", "details")
    });

    expect(await screen.findByRole("link", { name: "Back to trip" })).toHaveAttribute(
      "href",
      "/trips/trip-1?view=details"
    );
  });
});
