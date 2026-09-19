import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TripViewTabs } from "./TripViewTabs";

describe("compact trip view navigation", () => {
  it("keeps both views accessible inside the sticky navigation and marks the selection", async () => {
    const change = vi.fn();
    const view = render(<TripViewTabs view="timeline" onChange={change} />);
    expect(screen.getByRole("navigation", { name: "Trip views" })).toHaveAttribute(
      "data-trip-sticky"
    );
    expect(screen.getByRole("button", { name: "Timeline" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await userEvent.click(screen.getByRole("button", { name: "Trip details" }));
    expect(change).toHaveBeenCalledWith("details");
    view.rerender(<TripViewTabs view="details" onChange={change} />);
    expect(screen.getByRole("button", { name: "Trip details" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Timeline" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });
});
