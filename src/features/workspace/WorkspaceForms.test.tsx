import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItineraryItem, Trip } from "../trips/types";
import type { Booking, Requirement, Traveler, TripMember } from "./types";

const mocks = vi.hoisted(() => ({
  uploadDocument: vi.fn(),
  clearDraft: vi.fn(),
  listInvitations: vi.fn(),
  listAssociatedAccounts: vi.fn(),
  createTripMembershipOffer: vi.fn(),
  createInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
  listItinerary: vi.fn(),
  saveHotelStay: vi.fn(),
  updateBooking: vi.fn(),
  addRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  listRequirementAssigneeIds: vi.fn()
}));

vi.mock("../../components/ModalSheet", () => ({
  ModalSheet: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <section aria-label={title}>{children}</section>
  )
}));
vi.mock("../../lib/forms/useFormDraft", () => ({
  useFormDraft: () => ({ formRef: { current: null }, clearDraft: mocks.clearDraft })
}));
vi.mock("../metadata/VendorPicker", () => ({
  VendorPicker: ({
    defaultValue,
    onWebsite
  }: {
    defaultValue?: string;
    onWebsite?: (url: string) => void;
  }) => (
    <div>
      <input name="bookedViaName" defaultValue={defaultValue} />
      <button type="button" onClick={() => onWebsite?.("")}>
        Choose other booking source
      </button>
      <button type="button" onClick={() => onWebsite?.("https://www.cleartrip.com")}>
        Choose Cleartrip
      </button>
    </div>
  )
}));
vi.mock("../trips/api", () => ({ listItinerary: mocks.listItinerary }));
vi.mock("./api", () => ({
  DuplicateDocumentError: class DuplicateDocumentError extends Error {
    existingDocumentId = "existing";
  },
  uploadDocument: mocks.uploadDocument,
  listInvitations: mocks.listInvitations,
  listAssociatedAccounts: mocks.listAssociatedAccounts,
  createTripMembershipOffer: mocks.createTripMembershipOffer,
  createInvitation: mocks.createInvitation,
  revokeInvitation: mocks.revokeInvitation,
  saveHotelStay: mocks.saveHotelStay,
  updateBooking: mocks.updateBooking,
  addRequirement: mocks.addRequirement,
  updateRequirement: mocks.updateRequirement,
  listRequirementAssigneeIds: mocks.listRequirementAssigneeIds
}));

import {
  AddRequirementForm,
  EditBookingForm,
  ShareTripForm,
  UploadDocumentForm
} from "./WorkspaceForms";

const trip: Trip = {
  id: "trip-1",
  title: "Autumn trip",
  destination_summary: "Dubai",
  start_date: "2026-09-26",
  end_date: "2026-10-02",
  primary_timezone: "Asia/Kolkata",
  base_currency: "INR",
  status: "upcoming",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z"
};

const travelers: Traveler[] = [
  { id: "asha", trip_id: trip.id, display_name: "Asha", is_minor: false, created_at: "" },
  { id: "ravi", trip_id: trip.id, display_name: "Ravi", is_minor: false, created_at: "" }
];

const members: TripMember[] = [
  {
    user_id: "account-asha",
    role: "owner",
    participation_type: "traveler",
    joined_at: "2026-09-01T00:00:00.000Z",
    display_name: "Asha Account"
  },
  {
    user_id: "account-ravi",
    role: "editor",
    participation_type: "traveler",
    joined_at: "2026-09-01T00:00:00.000Z",
    display_name: "Ravi Account"
  }
];

function booking(type: Booking["type"]): Booking {
  return {
    id: `booking-${type}`,
    trip_id: trip.id,
    type,
    title: type === "hotel" ? "Harbour Hotel" : "Flight to Dubai",
    provider: type === "hotel" ? "Harbour Hotel" : "Air India",
    reference_code: "ABC123",
    start_at: "2026-09-26T04:30:00.000Z",
    end_at: "2026-09-26T08:00:00.000Z",
    source_timezone: "Asia/Kolkata",
    location: { label: "Marina" },
    details: {},
    journey_scope: type === "flight" ? "international" : null,
    booked_via_name: "Direct",
    booked_via_url: null,
    contact_name: "Front desk",
    contact_phone: "+919999999999",
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z"
  };
}

function hotelMilestone(
  eventType: "hotel_check_in" | "hotel_check_out",
  overrides: Partial<ItineraryItem> = {}
): ItineraryItem {
  const checkIn = eventType === "hotel_check_in";
  return {
    id: checkIn ? "check-in-1" : "check-out-1",
    trip_id: trip.id,
    booking_id: "booking-hotel",
    title: checkIn ? "Harbour Hotel · Check in" : "Harbour Hotel · Check out",
    event_type: eventType,
    starts_at: checkIn ? "2026-09-26T04:30:00.000Z" : "2026-09-26T08:00:00.000Z",
    ends_at: null,
    timezone: "Asia/Kolkata",
    location: { label: "Marina" },
    notes: null,
    applies_to_all_travelers: true,
    is_all_day: false,
    timing_mode: "exact",
    scheduled_date: null,
    has_explicit_start_time: true,
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides
  };
}

describe("Upload document flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.uploadDocument.mockResolvedValue({
      id: "document-1",
      title: "Other document · Everyone",
      sync_state: "synced"
    });
    mocks.listInvitations.mockResolvedValue([]);
    mocks.listAssociatedAccounts.mockResolvedValue([
      { user_id: "account-ravi", display_name: "Ravi Singh" }
    ]);
    mocks.createTripMembershipOffer.mockResolvedValue("offer-1");
    mocks.listItinerary.mockResolvedValue([
      hotelMilestone("hotel_check_in"),
      hotelMilestone("hotel_check_out")
    ]);
    mocks.saveHotelStay.mockImplementation(async (input) => ({
      booking: { ...booking("hotel"), id: input.bookingId },
      itinerary: []
    }));
    mocks.updateBooking.mockImplementation(async (input) => ({
      ...booking(input.type),
      id: input.id
    }));
    mocks.addRequirement.mockResolvedValue({});
    mocks.updateRequirement.mockResolvedValue({});
    mocks.listRequirementAssigneeIds.mockResolvedValue(["ravi"]);
  });

  it("requires a task while allowing due date and notes to be omitted", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddRequirementForm trip={trip} travelers={travelers} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Add task" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter the task that needs to be done."
    );
    expect(mocks.addRequirement).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Task"), "Pack phone chargers");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() =>
      expect(mocks.addRequirement).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Pack phone chargers",
          dueDate: undefined,
          notes: undefined
        })
      )
    );
  });

  it("adds readiness as a task with optional due date and notes without exposing legacy fields", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddRequirementForm trip={trip} travelers={travelers} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Task")).toBeInTheDocument();
    expect(screen.getByLabelText("When should it appear?")).toHaveValue("unscheduled");
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Notes (optional)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Type")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Task"), "Pack phone chargers");
    await user.selectOptions(screen.getByLabelText("When should it appear?"), "date_only");
    expect(screen.getByLabelText("Date")).not.toHaveAttribute("min");
    expect(screen.getByLabelText("Date")).not.toHaveAttribute("max");
    await user.type(screen.getByLabelText("Date"), "2026-09-20");
    await user.type(screen.getByLabelText("Notes (optional)"), "Pack one charger per traveler");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() =>
      expect(mocks.addRequirement).toHaveBeenCalledWith({
        tripId: trip.id,
        type: "custom",
        title: "Pack phone chargers",
        status: "to_check",
        destinationCountryCode: undefined,
        visaType: undefined,
        dueDate: "2026-09-20",
        timingMode: "date_only",
        anchorItineraryItemId: undefined,
        relativePosition: undefined,
        offsetMinutes: undefined,
        issuedOn: undefined,
        expiresOn: undefined,
        validityBufferDays: undefined,
        officialGuidanceUrl: undefined,
        linkedDocumentId: undefined,
        notes: "Pack one charger per traveler",
        travelerIds: []
      })
    );
  });

  it("defaults readiness to everyone and can limit it to selected travelers", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddRequirementForm trip={trip} travelers={travelers} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("radio", { name: /^Everyone/ })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Selected travelers" }));
    await user.click(screen.getByRole("checkbox", { name: "Ravi" }));
    await user.type(screen.getByLabelText("Task"), "Ravi passport check");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() =>
      expect(mocks.addRequirement).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Ravi passport check",
          travelerIds: ["ravi"]
        })
      )
    );
  });

  it("adds a readiness task a chosen offset before a dated event", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddRequirementForm trip={trip} travelers={travelers} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.type(screen.getByLabelText("Task"), "Prepare hotel documents");
    await user.selectOptions(screen.getByLabelText("When should it appear?"), "relative");
    await screen.findByRole("option", { name: "Harbour Hotel · Check in" });
    await user.selectOptions(screen.getByLabelText("Position"), "before");
    await user.selectOptions(screen.getByLabelText("Event"), "check-in-1");
    await user.clear(screen.getByLabelText("How long?"));
    await user.type(screen.getByLabelText("How long?"), "3");
    await user.selectOptions(screen.getByLabelText("Unit"), "days");
    await user.click(screen.getByRole("button", { name: "Add task" }));

    await waitFor(() =>
      expect(mocks.addRequirement).toHaveBeenCalledWith(
        expect.objectContaining({
          timingMode: "relative",
          anchorItineraryItemId: "check-in-1",
          relativePosition: "before",
          offsetMinutes: 4_320,
          dueDate: undefined
        })
      )
    );
  });

  it("edits task details without discarding hidden legacy data or assignees", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const requirement: Requirement = {
      id: "requirement-1",
      trip_id: trip.id,
      type: "visa",
      title: "Check visas",
      status: "in_progress",
      destination_country_code: "AE",
      visa_type: "Tourist",
      due_date: "2026-09-20",
      issued_on: "2026-09-01",
      expires_on: "2026-12-01",
      validity_buffer_days: 30,
      official_guidance_url: "https://example.gov/visa",
      guidance_checked_at: "2026-09-01T00:00:00.000Z",
      linked_document_id: "document-1",
      notes: "Keep the original details",
      version: 3
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddRequirementForm
            trip={trip}
            travelers={travelers}
            requirement={requirement}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const task = screen.getByLabelText("Task");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save task" })).toBeEnabled());
    await user.clear(task);
    await user.type(task, "Confirm visas");
    await user.clear(screen.getByLabelText("Date"));
    await user.type(screen.getByLabelText("Date"), "2026-09-29");
    await user.clear(screen.getByLabelText("Notes (optional)"));
    await user.type(
      screen.getByLabelText("Notes (optional)"),
      "Confirm requirements with the embassy"
    );
    await user.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() =>
      expect(mocks.updateRequirement).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "requirement-1",
          version: 3,
          title: "Confirm visas",
          type: "visa",
          status: "in_progress",
          destinationCountryCode: "AE",
          visaType: "Tourist",
          dueDate: "2026-09-29",
          timingMode: "date_only",
          issuedOn: "2026-09-01",
          expiresOn: "2026-12-01",
          validityBufferDays: 30,
          officialGuidanceUrl: "https://example.gov/visa",
          linkedDocumentId: "document-1",
          notes: "Confirm requirements with the embassy",
          travelerIds: ["ravi"]
        })
      )
    );
  });

  it("clears optional task details without discarding hidden legacy data or assignees", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const requirement: Requirement = {
      id: "requirement-1",
      trip_id: trip.id,
      type: "visa",
      title: "Check visas",
      status: "in_progress",
      destination_country_code: "AE",
      visa_type: "Tourist",
      due_date: "2026-09-20",
      issued_on: "2026-09-01",
      expires_on: "2026-12-01",
      validity_buffer_days: 30,
      official_guidance_url: "https://example.gov/visa",
      guidance_checked_at: "2026-09-01T00:00:00.000Z",
      linked_document_id: "document-1",
      notes: "Keep the original details",
      version: 3
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <AddRequirementForm
            trip={trip}
            travelers={travelers}
            requirement={requirement}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Save task" })).toBeEnabled());
    await user.selectOptions(screen.getByLabelText("When should it appear?"), "unscheduled");
    await user.clear(screen.getByLabelText("Notes (optional)"));
    await user.click(screen.getByRole("button", { name: "Save task" }));

    await waitFor(() =>
      expect(mocks.updateRequirement).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "requirement-1",
          version: 3,
          title: "Check visas",
          type: "visa",
          status: "in_progress",
          destinationCountryCode: "AE",
          visaType: "Tourist",
          dueDate: undefined,
          timingMode: "unscheduled",
          issuedOn: "2026-09-01",
          expiresOn: "2026-12-01",
          validityBufferDays: 30,
          officialGuidanceUrl: "https://example.gov/visa",
          linkedDocumentId: "document-1",
          notes: undefined,
          travelerIds: ["ravi"]
        })
      )
    );
  });

  it("offers a later trip to a known account without creating a new code", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <ShareTripForm trip={trip} travelers={travelers} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Known account" }));
    await screen.findByRole("option", { name: "Ravi Singh" });
    await user.selectOptions(
      screen.getByLabelText("Previously associated account"),
      "account-ravi"
    );
    await user.selectOptions(screen.getByLabelText("Which traveler are they?"), "ravi");
    await user.selectOptions(screen.getByLabelText("App access"), "editor");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() =>
      expect(mocks.createTripMembershipOffer).toHaveBeenCalledWith({
        tripId: trip.id,
        userId: "account-ravi",
        targetType: "traveler",
        travelerId: "ravi",
        role: "editor"
      })
    );
    expect(
      screen.getByText(/Ravi Singh can now accept Autumn trip from Trips/)
    ).toBeInTheDocument();
    expect(mocks.createInvitation).not.toHaveBeenCalled();
  });

  it("derives the Vault name from purpose and traveler while preserving the original file", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm
            trip={trip}
            travelers={travelers}
            preferredTravelerId="ravi"
            flightLegId="flight-1"
            contextTitle="Flight to Dubai"
            onClose={onClose}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.selectOptions(screen.getByLabelText("Document type"), "boarding_pass");
    expect(screen.getByText("Boarding pass · Ravi · Flight to Dubai")).toBeInTheDocument();
    const file = new window.File(["%PDF-test"], "scan-from-phone.pdf", { type: "application/pdf" });
    const fileInput = screen.getByLabelText<HTMLInputElement>("File");
    await user.upload(fileInput, file);
    expect(fileInput.files?.[0]).toBe(file);
    expect(screen.getByText("scan-from-phone.pdf")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Boarding pass · Ravi · Flight to Dubai",
          purpose: "boarding_pass",
          assignmentMode: "selected",
          travelerIds: ["ravi"],
          flightLegId: "flight-1",
          file
        })
      )
    );
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("defaults editable trip uploads to everyone signed in to the trip", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm trip={trip} travelers={travelers} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Who can open it?")).toHaveValue("trip");
    expect(screen.getByRole("radio", { name: /^Everyone/ })).toBeChecked();
    const file = new window.File(["%PDF-shared"], "shared-booking.pdf", {
      type: "application/pdf"
    });
    await user.upload(screen.getByLabelText<HTMLInputElement>("File"), file);
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "trip",
          file
        })
      )
    );
  });

  it("can continue a standalone upload directly into a linked timeline event", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const onCreateEvent = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm
            trip={trip}
            travelers={travelers}
            onCreateEvent={onCreateEvent}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const file = new window.File(["%PDF-event"], "museum-ticket.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText<HTMLInputElement>("File"), file);
    await user.click(screen.getByRole("checkbox", { name: /Add a timeline event after upload/i }));
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(onCreateEvent).toHaveBeenCalledWith({
        id: "document-1",
        title: "Other document · Everyone"
      })
    );
  });

  it("lets an editor change an upload from the trip default to private", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm trip={trip} travelers={travelers} onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.selectOptions(screen.getByLabelText("Who can open it?"), "private");
    const file = new window.File(["%PDF-private"], "private-booking.pdf", {
      type: "application/pdf"
    });
    await user.upload(screen.getByLabelText<HTMLInputElement>("File"), file);
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "private",
          file
        })
      )
    );
  });

  it("lets an editor share an upload with selected signed-in members", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm
            trip={trip}
            travelers={travelers}
            members={members}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.selectOptions(screen.getByLabelText("Who can open it?"), "selected_members");
    await user.click(screen.getByRole("checkbox", { name: "Ravi Account" }));
    const file = new window.File(["%PDF-selected"], "selected-booking.pdf", {
      type: "application/pdf"
    });
    await user.upload(screen.getByLabelText<HTMLInputElement>("File"), file);
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "selected_members",
          selectedUserIds: ["account-ravi"],
          file
        })
      )
    );
  });

  it("forces private visibility when trip editing is not allowed", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm trip={trip} travelers={travelers} privateOnly onClose={vi.fn()} />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.queryByLabelText("Who can open it?")).not.toBeInTheDocument();
    expect(screen.getByText(/Only you can open this upload/)).toBeInTheDocument();
    const file = new window.File(["%PDF-private-only"], "viewer-upload.pdf", {
      type: "application/pdf"
    });
    await user.upload(screen.getByLabelText<HTMLInputElement>("File"), file);
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          visibility: "private",
          file
        })
      )
    );
  });

  it("starts a later event upload with its travelers and lets the user change them", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const ticket = new window.File(["%PDF-flight-ticket"], "cleartrip-ticket.pdf", {
      type: "application/pdf"
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm
            trip={trip}
            travelers={travelers}
            bookingId="booking-flight"
            contextTitle="Flight to Dubai"
            initialFile={ticket}
            initialKind="flight_ticket"
            assignmentPreset={{ mode: "selected", travelerIds: ["asha", "ravi"] }}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("region", { name: "Finish attaching flight document" })
    ).toBeInTheDocument();
    expect(screen.getByText("Flight saved safely")).toBeInTheDocument();
    expect(screen.getByText("cleartrip-ticket.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("Document type")).toHaveValue("flight_ticket");
    expect(screen.getByRole("group", { name: "Who is it for?" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Traveler\(s\)/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Asha" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ravi" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: /^Everyone/ }));
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: "booking-flight",
          purpose: "ticket",
          assignmentMode: "shared",
          travelerIds: [],
          file: ticket
        })
      )
    );
  });

  it("associates a journey-leg upload with that exact leg and starts as a journey ticket", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm
            trip={trip}
            travelers={travelers}
            bookingId="booking-bus"
            journeyLegId="bus-leg-2"
            contextTitle="Connection 2 · DEL to DXB"
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Document type")).toHaveValue("journey_ticket");
    expect(
      screen.getByText("Train, bus, ferry or cab ticket · Everyone · Connection 2 · DEL to DXB")
    ).toBeInTheDocument();
    const file = new window.File(["%PDF-ticket"], "operator-ticket.pdf", {
      type: "application/pdf"
    });
    await user.upload(screen.getByLabelText<HTMLInputElement>("File"), file);
    await user.click(screen.getByRole("button", { name: /Save to Vault/i }));

    await waitFor(() =>
      expect(mocks.uploadDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: "booking-bus",
          journeyLegId: "bus-leg-2",
          category: "transport",
          purpose: "ticket",
          assignmentMode: "shared",
          file
        })
      )
    );
  });

  it("keeps a custom name while retaining the derived context", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UploadDocumentForm
            trip={trip}
            travelers={travelers}
            preferredTravelerId="asha"
            flightLegId="flight-1"
            contextTitle="Flight to Dubai"
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );
    await user.click(screen.getByText("Traveler(s)"));
    await user.type(screen.getByLabelText("Document name (optional)"), "Asha mobile boarding pass");
    expect(screen.getByText("Asha mobile boarding pass")).toBeInTheDocument();
    expect(
      screen.getByText(/Trip context: Flight ticket · Asha · Flight to Dubai/)
    ).toBeInTheDocument();
  });

  it("keeps journey endpoints authoritative when editing a flight booking", () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={{
              ...booking("flight"),
              details: { map_url: "https://maps.app.goo.gl/airport-terminal" }
            }}
            travelers={travelers}
            selectedTravelerIds={[]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByText(/international journey/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Edit route times, airports, stations, and connections/)
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Starts")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ends")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Location")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Google Maps link (optional)")).toHaveValue(
      "https://maps.app.goo.gl/airport-terminal"
    );
    expect(screen.queryByLabelText("Contact name")).not.toBeInTheDocument();
    expect(screen.queryByText("Booking time zone")).not.toBeInTheDocument();
  });

  it("lets a non-journey booking correct both its location and Maps link", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const existing = {
      ...booking("activity"),
      location: {
        label: "Old museum entrance",
        address: "Old museum entrance",
        map_url: "https://maps.app.goo.gl/old-entrance"
      }
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={[]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const location = screen.getByLabelText("Location");
    const mapUrl = screen.getByLabelText("Google Maps link (optional)");
    await user.clear(location);
    await user.type(location, "Correct museum entrance");
    await user.clear(mapUrl);
    await user.type(mapUrl, "https://maps.app.goo.gl/correct-entrance");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "booking-activity",
          location: "Correct museum entrance",
          mapUrl: "https://maps.app.goo.gl/correct-entrance"
        })
      )
    );
  });

  it.each(["FERRY-84", ""])(
    "lets a ferry reference be updated or cleared: %s",
    async (reference) => {
      const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
      });
      const user = userEvent.setup();
      render(
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <EditBookingForm
              trip={trip}
              booking={booking("ferry")}
              travelers={travelers}
              selectedTravelerIds={[]}
              onClose={vi.fn()}
            />
          </QueryClientProvider>
        </MemoryRouter>
      );
      const field = screen.getByLabelText("Booking reference (optional)");
      expect(field).not.toBeRequired();
      expect(field).toHaveValue("ABC123");
      await user.clear(field);
      if (reference) await user.type(field, reference);
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await waitFor(() =>
        expect(mocks.updateBooking).toHaveBeenCalledWith(
          expect.objectContaining({ id: "booking-ferry", referenceCode: reference })
        )
      );
    }
  );

  it("does not let a flight edit remove its required PNR", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={booking("flight")}
            travelers={travelers}
            selectedTravelerIds={[]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    await user.clear(screen.getByLabelText("Booking reference / PNR"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Add the flight booking reference / PNR."
    );
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("keeps flights booked without exposing an editable status", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const existing = {
      ...booking("flight"),
      reservation_state: "planned" as const,
      participant_scope: "everyone" as const
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={[]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.queryByLabelText("Booking status")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "booking-flight",
          reservationState: "booked",
          participantScope: "everyone",
          travelerIds: []
        })
      )
    );
  });

  it("reconciles the booking website when the booked-via choice changes", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const existing = { ...booking("flight"), booked_via_url: "https://old.example/confirmation" };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={[]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const website = screen.getByLabelText("Booking website");
    expect(website).toHaveValue("https://old.example/confirmation");
    await user.click(screen.getByRole("button", { name: "Choose other booking source" }));
    expect(website).toHaveValue("");

    await user.type(website, "https://manual.example/booking");
    await user.click(screen.getByRole("button", { name: "Choose Cleartrip" }));
    expect(website).toHaveValue("https://www.cleartrip.com");
  });

  it("uses the hotel name as the property provider and exposes the stay timezone", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={booking("hotel")}
            travelers={travelers}
            selectedTravelerIds={[]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    const property = screen.getByLabelText("Hotel / property name");
    await user.clear(property);
    await user.type(property, "Marina Bay Hotel");
    expect(screen.queryByText("Service provider")).not.toBeInTheDocument();
    await screen.findByLabelText("Printed check-in time (optional)");
    await user.click(screen.getByRole("button", { name: "Stay time zone" }));
    await user.click(screen.getByRole("option", { name: /Dubai.*Asia\/Dubai/i }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.saveHotelStay).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: "booking-hotel",
          eventType: "hotel_check_in",
          title: "Marina Bay Hotel",
          provider: "Marina Bay Hotel",
          timezone: "Asia/Dubai",
          startsAt: "2026-09-26T06:00:00.000Z",
          endsAt: "2026-09-26T09:30:00.000Z"
        })
      )
    );
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it("preserves date-only hotel milestones and saves both sides of the stay atomically", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const existing = {
      ...booking("hotel"),
      participant_scope: "selected" as const,
      location: {
        label: "Marina",
        address: "1 Bay Road",
        map_url: "https://maps.app.goo.gl/hotel"
      },
      details: { room_type: "Family suite", notes: "Late arrival" }
    };
    mocks.listItinerary.mockResolvedValue([
      hotelMilestone("hotel_check_in", {
        starts_at: "2026-09-27T06:30:00.000Z",
        timing_mode: "date_only",
        scheduled_date: "2026-09-27",
        has_explicit_start_time: false
      }),
      hotelMilestone("hotel_check_out", {
        starts_at: "2026-09-29T04:30:00.000Z",
        timing_mode: "exact",
        scheduled_date: null,
        has_explicit_start_time: true
      })
    ]);
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={["asha"]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(await screen.findByLabelText("Check-in date")).toHaveValue("2026-09-27");
    expect(screen.getByLabelText("Printed check-in time (optional)")).toHaveValue("");
    expect(screen.getByLabelText("Printed checkout time (optional)")).toHaveValue("10:00");
    const mapUrl = screen.getByLabelText("Google Maps link (optional)");
    expect(mapUrl).toHaveValue("https://maps.app.goo.gl/hotel");
    await user.clear(mapUrl);
    await user.type(mapUrl, "https://maps.app.goo.gl/corrected-hotel");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.saveHotelStay).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: "booking-hotel",
          eventType: "hotel_check_in",
          startsAt: "2026-09-27T06:30:00.000Z",
          endsAt: "2026-09-29T04:30:00.000Z",
          hotelCheckInHasTime: false,
          hotelCheckoutHasTime: true,
          bookingDetails: { room_type: "Family suite" },
          notes: "Late arrival",
          mapUrl: "https://maps.app.goo.gl/corrected-hotel",
          participantScope: "selected",
          travelerIds: ["asha"]
        })
      )
    );
    expect(mocks.updateBooking).not.toHaveBeenCalled();
  });

  it.each(["add", "edit", "clear", "invalid"])(
    "can %s optional hotel room details later without losing metadata",
    async (action) => {
      const user = userEvent.setup();
      const existing = {
        ...booking("hotel"),
        details: {
          custom_instruction: "Keep this",
          notes: "Late arrival",
          ...(action === "add"
            ? {}
            : { room_type: "Family suite", room_count: 2, lead_guest: "Asha" })
        }
      };
      mocks.listItinerary.mockResolvedValue([
        hotelMilestone("hotel_check_in"),
        hotelMilestone("hotel_check_out")
      ]);
      render(
        <MemoryRouter>
          <QueryClientProvider
            client={
              new QueryClient({
                defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
              })
            }
          >
            <EditBookingForm
              trip={trip}
              booking={existing}
              travelers={travelers}
              selectedTravelerIds={[]}
              onClose={vi.fn()}
            />
          </QueryClientProvider>
        </MemoryRouter>
      );
      await screen.findByLabelText("Check-in date");
      const roomType = screen.getByLabelText("Room type (optional)");
      const roomCount = screen.getByLabelText("Number of rooms (optional)");
      const leadGuest = screen.getByLabelText("Lead guest (optional)");
      expect(roomType).toHaveValue(action === "add" ? "" : "Family suite");
      expect(roomCount).toHaveValue(action === "add" ? null : 2);
      expect(leadGuest).toHaveValue(action === "add" ? "" : "Asha");
      await user.clear(roomType);
      await user.clear(roomCount);
      await user.clear(leadGuest);
      if (action !== "clear") {
        await user.type(roomType, "Twin room");
        await user.type(roomCount, action === "invalid" ? "1.5" : "3");
        await user.type(leadGuest, "Ravi");
      }
      fireEvent.submit(screen.getByRole("button", { name: "Save changes" }).closest("form")!);
      if (action === "invalid") {
        expect(await screen.findByRole("alert")).toHaveTextContent(
          "Number of rooms must be a whole number"
        );
        expect(mocks.saveHotelStay).not.toHaveBeenCalled();
      } else {
        await waitFor(() =>
          expect(mocks.saveHotelStay).toHaveBeenCalledWith(
            expect.objectContaining({
              notes: "Late arrival",
              bookingDetails: {
                custom_instruction: "Keep this",
                ...(action === "clear"
                  ? {}
                  : { room_type: "Twin room", room_count: 3, lead_guest: "Ravi" })
              }
            })
          )
        );
      }
    }
  );

  it("preserves a planned booking and an explicit selected-all traveler scope", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const existing = {
      ...booking("activity"),
      reservation_state: "planned" as const,
      participant_scope: "selected" as const
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={["asha", "ravi"]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Booking status")).toHaveValue("planned");
    expect(screen.getByRole("radio", { name: "Selected travelers" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Everyone" })).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "booking-activity",
          reservationState: "planned",
          participantScope: "selected",
          travelerIds: ["asha", "ravi"]
        })
      )
    );
  });

  it("can enrich a planned ground journey into a booked ticket", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const existing = {
      ...booking("train"),
      reservation_state: "planned" as const,
      participant_scope: "selected" as const
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={["asha"]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(
      screen.getByRole("option", { name: "Plan only — ticket not booked" })
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Buy when needed / walk-up" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Ticket booked" })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Booking status"), "booked");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "booking-train",
          reservationState: "booked",
          participantScope: "selected",
          travelerIds: ["asha"]
        })
      )
    );
  });

  it("keeps Everyone canonical even when legacy traveler rows are supplied", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const user = userEvent.setup();
    const existing = {
      ...booking("hotel"),
      reservation_state: "booked" as const,
      participant_scope: "everyone" as const
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={["asha", "ravi"]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("radio", { name: "Everyone" })).toBeChecked();
    await screen.findByLabelText("Printed check-in time (optional)");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.saveHotelStay).toHaveBeenCalledWith(
        expect.objectContaining({
          bookingId: "booking-hotel",
          reservationState: "booked",
          participantScope: "everyone",
          travelerIds: []
        })
      )
    );
  });

  it("uses compact cab language for planned, booked, and completed rides", () => {
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { retry: false } }
    });
    const existing = {
      ...booking("cab"),
      reservation_state: "planned" as const,
      participant_scope: "everyone" as const
    };
    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <EditBookingForm
            trip={trip}
            booking={existing}
            travelers={travelers}
            selectedTravelerIds={[]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </MemoryRouter>
    );

    expect(screen.getByRole("option", { name: "Need a cab" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Booked in advance" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Already took this ride" })).toBeInTheDocument();
  });
});
