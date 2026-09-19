import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ReadinessProgress, TripReadinessSection } from "./TripReadinessSummary";

describe("readiness summary", () => {
  it("shows determinate progress without looking busy", () => {
    const { container, rerender } = render(<ReadinessProgress resolved={1} total={4} />);
    expect(screen.getByText("1 of 4 tasks done")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "25");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "25%" });
    expect(container.querySelector('[aria-busy="true"], .animate-spin')).toBeNull();
    rerender(<ReadinessProgress resolved={4} total={4} detailed />);
    expect(screen.getByText("All tasks complete")).toBeVisible();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    rerender(<ReadinessProgress resolved={0} total={0} />);
    expect(screen.getByText("No tasks yet")).toBeVisible();
    expect(screen.queryByText("All tasks complete")).not.toBeInTheDocument();
  });

  it("keeps open and add actions separate, with add controlled by permissions", async () => {
    const add = vi.fn();
    const { rerender } = render(
      <MemoryRouter>
        <TripReadinessSection
          resolved={1}
          total={4}
          href="/trips/trip-1/readiness"
          onAddTask={add}
        />
      </MemoryRouter>
    );
    expect(screen.getByText("3 remaining")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open checklist" })).toHaveAttribute(
      "href",
      "/trips/trip-1/readiness"
    );
    await userEvent.click(screen.getByRole("button", { name: "Add task" }));
    expect(add).toHaveBeenCalledOnce();
    rerender(
      <MemoryRouter>
        <TripReadinessSection resolved={1} total={4} href="/trips/trip-1/readiness" />
      </MemoryRouter>
    );
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open checklist" })).toBeVisible();
  });
});
