export const COST_SAVE_WARNING =
  "The event is saved, but its cost could not be added. Add the cost from this event later.";

export async function saveOptionalCreationCost(save: (() => Promise<unknown>) | undefined) {
  if (!save) return undefined;
  try {
    await save();
    return undefined;
  } catch {
    return COST_SAVE_WARNING;
  }
}
