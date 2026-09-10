import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TravelerSwitcher } from "./TravelerSwitcher";

const travelers = [
  { id: "sam", trip_id: "trip", display_name: "Sam", is_minor: false, created_at: "2026-09-10" },
  { id: "maya", trip_id: "trip", display_name: "Maya", is_minor: true, created_at: "2026-09-10" }
];

describe("traveler switcher", () => {
  it("switches the planning context without changing account identity", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TravelerSwitcher travelers={travelers} value={null} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Everyone" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Maya/ }));
    expect(onChange).toHaveBeenCalledWith("maya");
    expect(screen.getByText(/remain signed in as yourself/i)).toBeInTheDocument();
  });
});
