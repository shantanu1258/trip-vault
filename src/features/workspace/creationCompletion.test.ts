import { describe, expect, it, vi } from "vitest";
import { COST_SAVE_WARNING, saveOptionalCreationCost } from "./creationCompletion";

describe("optional cost completion", () => {
  it("returns no warning after the dependent cost save succeeds", async () => {
    const save = vi.fn().mockResolvedValue({ id: "cost-1" });

    await expect(saveOptionalCreationCost(save)).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledOnce();
  });

  it("turns a cost-only failure into a completion warning after the core event exists", async () => {
    const save = vi.fn().mockRejectedValue(new Error("cost insert rejected"));

    await expect(saveOptionalCreationCost(save)).resolves.toBe(COST_SAVE_WARNING);
    expect(save).toHaveBeenCalledOnce();
  });

  it("does nothing when no optional cost was requested", async () => {
    await expect(saveOptionalCreationCost(undefined)).resolves.toBeUndefined();
  });
});
