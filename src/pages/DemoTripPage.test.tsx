import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../lib/local-db/database", () => ({
  database: {
    settings: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) }
  }
}));

import { DemoTripPage } from "./DemoTripPage";

describe("current demo readiness", () => {
  it("keeps the floating trip actions above the bottom navigation through tablet widths", () => {
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );

    const actions = screen.getByRole("link", { name: "Sign in to add event" }).parentElement;
    expect(actions).toHaveClass("bottom-[calc(5.5rem+env(safe-area-inset-bottom))]", "lg:bottom-6");
    expect(actions).not.toHaveClass("sm:bottom-6");
  });

  it("keeps event and task cards full-width until the extra-large timeline layout", () => {
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );

    const taskCard = screen.getByRole("checkbox", {
      name: "Mark as done: Pack Leela's medicines"
    }).parentElement;
    const taskRow = taskCard?.parentElement;
    expect(taskRow).toHaveClass("xl:grid-cols-[6rem_2.5rem_minmax(0,1fr)]", "xl:gap-4", "xl:pl-0");
    expect(taskRow).not.toHaveClass(
      "sm:grid-cols-[6rem_2.5rem_minmax(0,1fr)]",
      "sm:gap-4",
      "sm:pl-0"
    );
    expect(taskRow?.children[0]).toHaveClass("xl:hidden");
    expect(taskRow?.children[0]).not.toHaveClass("sm:hidden");
    expect(taskRow?.children[1]).toHaveClass("xl:block");
    expect(taskRow?.children[1]).not.toHaveClass("sm:block");
    expect(taskRow?.children[2]).toHaveClass("xl:grid");
    expect(taskRow?.children[2]).not.toHaveClass("sm:grid");
    expect(taskCard).toHaveClass("xl:px-4");
    expect(taskCard).not.toHaveClass("sm:px-4");

    const eventCard = screen
      .getByRole("button", { name: "Open details for Fly to Rome" })
      .closest("article");
    const eventRow = eventCard?.parentElement;
    const timeline = eventRow?.parentElement;
    expect(timeline).toHaveClass("xl:before:left-[8.25rem]");
    expect(timeline).not.toHaveClass("sm:before:left-[8.25rem]");
    expect(eventRow?.previousElementSibling).toHaveClass("xl:pl-[10.5rem]");
    expect(eventRow?.previousElementSibling).not.toHaveClass("sm:pl-[10.5rem]");
    expect(eventRow).toHaveClass("xl:grid-cols-[6rem_2.5rem_minmax(0,1fr)]", "xl:gap-4", "xl:pl-0");
    expect(eventRow).not.toHaveClass(
      "sm:grid-cols-[6rem_2.5rem_minmax(0,1fr)]",
      "sm:gap-4",
      "sm:pl-0"
    );
    expect(eventRow?.children[0]).toHaveClass("xl:hidden");
    expect(eventRow?.children[0]).not.toHaveClass("sm:hidden");
    expect(eventRow?.children[1]).toHaveClass("xl:block");
    expect(eventRow?.children[1]).not.toHaveClass("sm:block");
    expect(eventRow?.children[2]).toHaveClass("xl:grid");
    expect(eventRow?.children[2]).not.toHaveClass("sm:grid");
    expect(eventCard).toHaveClass("pr-16", "xl:p-5");
    expect(eventCard).not.toHaveClass("sm:p-5");
    expect(eventCard?.querySelector('[data-event-type="flight"]')).toHaveClass("xl:hidden");
    expect(eventCard?.querySelector('[data-event-type="flight"]')).not.toHaveClass("sm:hidden");
    expect(eventCard?.querySelector("time")).toHaveClass("xl:hidden");
    expect(eventCard?.querySelector("time")).not.toHaveClass("sm:hidden");
  });

  it("defaults to everyone and immediately filters after the People switch", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Pack Leela's medicines")).toBeInTheDocument();
    expect(screen.getByText("Check passports and visas")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "People and sharing · Everyone" }));
    await user.click(screen.getByRole("button", { name: "Show Sam Shah's trip information" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Pack Leela's medicines")).not.toBeInTheDocument();
    expect(screen.getByText("Check passports and visas")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Sam Shah's timeline" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "People and sharing · Sam Shah" }));
    await user.click(screen.getByRole("button", { name: "Show Leela Devi's trip information" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Pack Leela's medicines")).toBeInTheDocument();
  });

  it("updates the demo readiness total when a task is checked", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );

    expect(screen.getByText("1 of 3 tasks done")).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", { name: "Mark as done: Pack Leela's medicines" })
    );
    expect(screen.getByText("2 of 3 tasks done")).toBeInTheDocument();
  });

  it("uses the shared trip-detail rows, traveler document filtering, and expense sheet", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Trip details" }));
    expect(screen.getByRole("heading", { name: "Reservations" })).toBeInTheDocument();
    expect(screen.getByText("DEL T3 → FCO T1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "People and sharing · Everyone" }));
    await user.click(screen.getByRole("button", { name: "Show Leela Devi's trip information" }));
    expect(screen.getByText("3 sample documents for Leela Devi")).toBeInTheDocument();
    expect(screen.getByText("Casa Bellora confirmation")).toBeInTheDocument();
    expect(screen.queryByText("Boarding pass - Sam")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Leela Devi's trip costs" })).toBeInTheDocument();
    expect(screen.getByText("2", { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByText("€4,200.00").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Open itemized trip expenses" }));
    expect(screen.getByRole("heading", { name: "Leela Devi's trip expenses" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Review every expense and choose whether traveler balances should be calculated."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Show balances" })).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Show balances" }));
    expect(screen.getByText("owes €840.00")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View details for Aster Air flights" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View details for Colosseum evening tour" })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View details for Aster Air flights" }));
    expect(screen.getByRole("heading", { name: "Aster Air flights" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Leela Devi's trip expenses" })).toBeInTheDocument();
  });

  it("shows a planned event without pretending it already has a booking", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );

    await user.click(screen.getByRole("button", { name: "Open details for Venice sunset walk" }));
    expect(screen.getByText("Planned without a booking")).toBeInTheDocument();
    expect(screen.queryByText("Sample booking")).not.toBeInTheDocument();
  });
});
