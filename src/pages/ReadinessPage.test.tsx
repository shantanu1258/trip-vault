import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "../features/trips/types";
import type { Requirement } from "../features/workspace/types";

const mocks = vi.hoisted(() => ({
  archiveRequirement: vi.fn(),
  getTrip: vi.fn(),
  listMembers: vi.fn(),
  listRequirements: vi.fn(),
  listTravelers: vi.fn(),
  listTripRequirementAssignees: vi.fn(),
  updateRequirementStatus: vi.fn()
}));

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../features/sync/localSync", () => ({ localProfileId: vi.fn().mockResolvedValue("user-1") }));
vi.mock("../features/trips/api", () => ({ getTrip: mocks.getTrip }));
vi.mock("../features/workspace/travelerFocus", () => ({ readTravelerFocus: () => null }));
vi.mock("../features/workspace/WorkspaceForms", () => ({
  AddRequirementForm: ({ requirement, onClose }: { requirement?: Requirement; onClose: () => void }) => (
    <section aria-label={requirement ? "Edit readiness item" : "Add readiness item"}>
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

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/trips/trip-1/readiness"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes><Route path="/trips/:tripId/readiness" element={<ReadinessPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("readiness card interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTrip.mockResolvedValue(trip);
    mocks.listRequirements.mockResolvedValue([requirement]);
    mocks.listTravelers.mockResolvedValue([]);
    mocks.listMembers.mockResolvedValue([{ user_id: "user-1", role: "owner", participation_type: "traveler", joined_at: null, display_name: "Owner" }]);
    mocks.listTripRequirementAssignees.mockResolvedValue([]);
    mocks.updateRequirementStatus.mockResolvedValue(undefined);
    mocks.archiveRequirement.mockResolvedValue(undefined);
  });

  it("opens edit from the card body without stealing status or archive actions", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    renderPage();

    const editCard = await screen.findByRole("button", { name: "Edit Passport ready" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Status for Passport ready" }), "complete");
    await waitFor(() => expect(mocks.updateRequirementStatus).toHaveBeenCalledWith("requirement-1", "complete", "trip-1"));
    expect(screen.queryByRole("region", { name: "Edit readiness item" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Archive" }));
    await waitFor(() => expect(mocks.archiveRequirement).toHaveBeenCalledWith(requirement));
    expect(confirm).toHaveBeenCalledWith("Archive Passport ready?");
    expect(screen.queryByRole("region", { name: "Edit readiness item" })).not.toBeInTheDocument();

    await user.click(editCard);
    expect(await screen.findByRole("region", { name: "Edit readiness item" })).toHaveTextContent("Passport ready");
  });
});
