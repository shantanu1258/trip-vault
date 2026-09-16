import type { DocumentVisibility, MemberRole, ParticipationType, TravelerManager } from "./types";

export function canEditTrip(role?: MemberRole) {
  return role === "owner" || role === "editor";
}
export function canManageMembership(role?: MemberRole) {
  return role === "owner";
}
export function canUseTravelerActions(participation?: ParticipationType) {
  return participation === "traveler";
}
export function canManageTraveler(
  manager: TravelerManager | undefined,
  capability: "view" | "documents" | "profile"
) {
  if (!manager) return false;
  if (capability === "view") return manager.can_view_documents;
  if (capability === "documents") return manager.can_manage_documents;
  return manager.can_edit_profile;
}
export function canReadDocument(input: {
  visibility: DocumentVisibility;
  actorId: string;
  uploaderId: string;
  isTripMember: boolean;
  travelerAccountId?: string | null;
  documentTravelerAccountId?: string | null;
  isDelegatedManager?: boolean;
  selectedMemberIds?: string[];
}) {
  if (input.actorId === input.uploaderId) return true;
  if (!input.isTripMember) return false;
  if (input.visibility === "trip") return true;
  if (input.visibility === "selected_members")
    return Boolean(input.selectedMemberIds?.includes(input.actorId));
  if (input.visibility === "traveler_and_managers")
    return (
      input.travelerAccountId === input.documentTravelerAccountId ||
      Boolean(input.isDelegatedManager)
    );
  return false;
}

export function validInvitationTarget(
  target: "traveler" | "collaborator",
  travelerId?: string | null
) {
  return target === "traveler" ? Boolean(travelerId) : !travelerId;
}
