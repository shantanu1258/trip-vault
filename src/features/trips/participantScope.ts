import type { ParticipantScope } from "./types";

export type ParticipantSelection = {
  participantScope: ParticipantScope;
  travelerIds: string[];
};

/**
 * Keeps the explicit Everyone/Selected choice separate from the selected IDs.
 * The fallback preserves legacy callers while new forms always provide scope.
 */
export function normalizeParticipantSelection(
  participantScope: ParticipantScope | undefined,
  travelerIds: string[] | undefined
): ParticipantSelection {
  const uniqueTravelerIds = [...new Set((travelerIds ?? []).filter(Boolean))];
  const scope = participantScope ?? (uniqueTravelerIds.length ? "selected" : "everyone");

  if (scope === "everyone") {
    if (uniqueTravelerIds.length)
      throw new Error("Everyone cannot also contain selected travelers.");
    return { participantScope: scope, travelerIds: [] };
  }
  if (!uniqueTravelerIds.length) throw new Error("Select at least one traveler.");
  return { participantScope: scope, travelerIds: uniqueTravelerIds };
}
