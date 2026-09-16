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
