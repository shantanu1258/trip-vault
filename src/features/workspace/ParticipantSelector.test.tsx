import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ParticipantSelector } from "./ParticipantSelector";

const travelers = [
  { id: "traveler-1", trip_id: "trip-1", display_name: "Asha", is_minor: false, created_at: "" },
  { id: "traveler-2", trip_id: "trip-1", display_name: "Ravi", is_minor: false, created_at: "" }
];

describe("ParticipantSelector", () => {
  it("reports the explicit scope and selected traveler IDs", async () => {
    const user = userEvent.setup();
    const onSelectionChange = vi.fn();
    render(
      <ParticipantSelector
        travelers={travelers}
        initialScope="everyone"
        scopeName="participantScope"
        onSelectionChange={onSelectionChange}
      />
    );

    await user.click(screen.getByRole("radio", { name: "Selected travelers" }));
    await user.click(screen.getByRole("checkbox", { name: "Asha" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith("selected", ["traveler-1"]);
    await user.click(screen.getByRole("radio", { name: "Everyone" }));
    expect(onSelectionChange).toHaveBeenLastCalledWith("everyone", []);
  });

  it("preserves an explicit selected-all scope", () => {
    render(
      <ParticipantSelector
        travelers={travelers}
        initialScope="selected"
        selectedTravelerIds={travelers.map((traveler) => traveler.id)}
        scopeName="participantScope"
      />
    );
    expect(screen.getByRole("radio", { name: "Selected travelers" })).toBeChecked();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});
