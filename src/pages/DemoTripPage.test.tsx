import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <>{children}</>
}));
vi.mock("../lib/local-db/database", () => ({
  database: {
    settings: { get: vi.fn().mockResolvedValue(null), put: vi.fn().mockResolvedValue(undefined) }
  }
}));
vi.mock("../components/DocumentPreview", () => ({
  DocumentPreview: ({ title }: { title: string }) => (
    <div aria-label="In-app file preview">{title}</div>
  )
}));

import { DemoTripPage } from "./DemoTripPage";
import { demoVaultDocumentById } from "../demo/model";

describe("current demo readiness", () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllGlobals());
  it("uses the live seat editor with resettable demo-only state", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );
    const openSeats = async () => {
      await user.click(screen.getByRole("button", { name: "Open details for Fly to Rome" }));
      await user.click(screen.getByRole("button", { name: "Seats · DEL → FCO" }));
    };
    await openSeats();
    const seat = screen.getByRole("textbox", { name: "Seat for Sam Shah" });
    expect(seat).toHaveAttribute("placeholder", "e.g. 12A");
    await user.type(seat, "14c");
    await user.click(screen.getByRole("button", { name: "Save seat for Sam Shah" }));
    expect(screen.getByRole("status")).toHaveTextContent("Demo seat saved");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await openSeats();
    expect(screen.getByRole("textbox", { name: "Seat for Sam Shah" })).toHaveValue("14C");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Reset demo" }));
    await openSeats();
    expect(screen.getByRole("textbox", { name: "Seat for Sam Shah" })).toHaveValue("");
  });
  it("uses shared document cards and previews bundled files in-app without a Vault request", async () => {
    const fetchFile = vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["sample"], { type: "application/pdf" })
    });
    vi.stubGlobal("fetch", fetchFile);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: "Open details for Fly to Rome" }));
    const detail = screen.getByRole("dialog");
    expect(detail.querySelector(".event-hero")).toBeInTheDocument();
    expect(detail.querySelector("[data-document-metadata]")).toBeInTheDocument();
    await user.click(within(detail).getByRole("button", { name: "View document" }));
    expect(await screen.findByLabelText("In-app file preview")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open with device viewer" })).toHaveAttribute(
      "target",
      "_blank"
    );
    expect(screen.getByRole("button", { name: "Share document" })).toBeInTheDocument();
    expect(fetchFile).toHaveBeenCalledTimes(1);
    expect(fetchFile.mock.calls[0][0]).toMatch(/^\/.*\.pdf$/);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Fly to Rome");
    expect(demoVaultDocumentById.get("insurance")?.category).toBe("insurance");
  });
  it("starts compact and keeps multiple event cards open", async () => {
    render(
      <MemoryRouter>
        <DemoTripPage />
      </MemoryRouter>
    );
    expect(screen.getByRole("button", { name: "Collapse Fly to Rome" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByRole("heading", { name: /Wed, 24 Jun 2026/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Expand Train to Florence" }));
    expect(
      screen.getByRole("checkbox", { name: "Mark as done: Pack Leela's medicines" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Fly to Rome" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
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

    await user.click(screen.getByRole("button", { name: "Expand Venice sunset walk" }));
    await user.click(screen.getByRole("button", { name: "Open details for Venice sunset walk" }));
    expect(screen.getByText("Planned without a booking")).toBeInTheDocument();
    expect(screen.queryByText("Sample booking")).not.toBeInTheDocument();
  });
});
