import { describe, expect, it } from "vitest";
import { canEditTrip, canManageMembership, canManageTraveler, canReadDocument, canUseTravelerActions, validInvitationTarget } from "./permissions";

describe("collaboration capabilities", () => {
  it("allows owners and editors to edit but only owners to manage members", () => { expect(canEditTrip("editor")).toBe(true); expect(canEditTrip("viewer")).toBe(false); expect(canManageMembership("owner")).toBe(true); expect(canManageMembership("editor")).toBe(false); });
  it("keeps non-traveling collaborators out of traveler-only actions", () => expect(canUseTravelerActions("collaborator")).toBe(false));
  it("requires explicit manager capabilities", () => { const manager = { traveler_id: "t", user_id: "u", can_view_documents: true, can_manage_documents: false, can_edit_profile: true }; expect(canManageTraveler(manager, "view")).toBe(true); expect(canManageTraveler(manager, "documents")).toBe(false); });
  it("evaluates private, trip, selected-member, and delegated document visibility", () => { const base = { actorId: "reader", uploaderId: "owner", isTripMember: true }; expect(canReadDocument({ ...base, visibility: "private" })).toBe(false); expect(canReadDocument({ ...base, visibility: "trip" })).toBe(true); expect(canReadDocument({ ...base, visibility: "selected_members", selectedMemberIds: ["reader"] })).toBe(true); expect(canReadDocument({ ...base, visibility: "traveler_and_managers", isDelegatedManager: true })).toBe(true); });
  it("requires mutually exclusive traveler and collaborator invitation targets", () => { expect(validInvitationTarget("traveler", "person")).toBe(true); expect(validInvitationTarget("traveler", null)).toBe(false); expect(validInvitationTarget("collaborator", null)).toBe(true); expect(validInvitationTarget("collaborator", "person")).toBe(false); });
});
