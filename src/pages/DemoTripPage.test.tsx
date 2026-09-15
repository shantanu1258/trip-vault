import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../components/AppShell", () => ({ AppShell: ({ children }: { children: ReactNode }) => <>{children}</> }));
vi.mock("../lib/local-db/database", () => ({
  database: { settings: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) } }
}));

import { DemoTripPage } from "./DemoTripPage";

describe("current demo readiness", () => {
  it("defaults to everyone and immediately filters after the People switch", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><DemoTripPage /></MemoryRouter>);

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
    render(<MemoryRouter><DemoTripPage /></MemoryRouter>);

    expect(screen.getByText("1 of 3 tasks done")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Mark as done: Pack Leela's medicines" }));
    expect(screen.getByText("2 of 3 tasks done")).toBeInTheDocument();
  });
});
