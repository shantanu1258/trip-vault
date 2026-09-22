import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../components/ThemeToggle", () => ({ ThemeToggle: () => <button>Theme</button> }));
vi.mock("../lib/supabase/client", () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin" } } }) } }
}));
vi.mock("../features/admin/api", async () => {
  const actual =
    await vi.importActual<typeof import("../features/admin/api")>("../features/admin/api");
  return {
    ...actual,
    isCurrentUserAdmin: vi.fn().mockResolvedValue(true),
    listConfigReleases: vi.fn().mockResolvedValue([
      {
        id: "draft-1",
        version_number: null,
        status: "draft",
        based_on_release_id: null,
        change_note: "Test draft",
        created_at: "2026-09-16T00:00:00.000Z",
        published_at: null
      }
    ]),
    listAirlines: vi.fn().mockResolvedValue([
      {
        id: "air-india",
        config_release_id: "draft-1",
        stable_key: "air-india",
        name: "Air India",
        iata_code: "AI",
        icao_code: "AIC",
        aliases: [],
        check_in_url_template: null,
        manage_booking_url_template: null,
        status_url_template: null,
        tracker_url_template: null,
        brand_color: "#d71920",
        logo_asset_path: null,
        banner_asset_path: null,
        is_enabled: true,
        sort_order: 0
      },
      {
        id: "vistara",
        config_release_id: "draft-1",
        stable_key: "vistara",
        name: "Vistara",
        iata_code: "UK",
        icao_code: "VTI",
        aliases: ["Tata SIA"],
        check_in_url_template: null,
        manage_booking_url_template: null,
        status_url_template: null,
        tracker_url_template: null,
        brand_color: "#512d6d",
        logo_asset_path: null,
        banner_asset_path: null,
        is_enabled: false,
        sort_order: 1
      }
    ]),
    listAirports: vi.fn().mockResolvedValue([]),
    listVendors: vi.fn().mockResolvedValue([]),
    listCatalogSuggestions: vi.fn().mockResolvedValue([]),
    listDefaults: vi.fn().mockResolvedValue([]),
    getThemePalette: vi.fn().mockResolvedValue({
      light: actual.defaultLightTokens,
      dark: actual.defaultDarkTokens
    }),
    getAdminAudit: vi.fn().mockResolvedValue([]),
    discardConfigDraft: vi.fn().mockResolvedValue(undefined),
    getReleaseSnapshot: vi.fn().mockResolvedValue({})
  };
});

import { AdminPage } from "./AdminPage";
import { ConfirmDialogProvider } from "../components/ConfirmDialogProvider";
import {
  discardConfigDraft,
  getReleaseSnapshot,
  listConfigReleases,
  type ConfigRelease
} from "../features/admin/api";

function renderAdmin(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ConfirmDialogProvider>{node}</ConfirmDialogProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("administrator console", () => {
  beforeEach(() => vi.clearAllMocks());
  it("shows draft deletion only for drafts and confirms before discarding", async () => {
    const user = userEvent.setup();
    vi.mocked(listConfigReleases).mockResolvedValueOnce([
      {
        id: "draft-1",
        version_number: null,
        status: "draft",
        created_at: "2026-09-22",
        change_note: "Test draft"
      },
      {
        id: "live",
        version_number: 2,
        status: "published",
        created_at: "2026-09-21",
        change_note: "Live"
      }
    ] as ConfigRelease[]);
    renderAdmin(<AdminPage section="releases" />);
    const button = await screen.findByRole("button", { name: "Delete draft" });
    expect(screen.getAllByRole("button", { name: "Delete draft" })).toHaveLength(1);
    await user.click(button);
    expect(discardConfigDraft).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(discardConfigDraft).not.toHaveBeenCalled();
    await user.click(button);
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Delete draft" })
    );
    await waitFor(() => expect(discardConfigDraft).toHaveBeenCalledWith("draft-1"));
  });
  it("loads exact release changes on demand with expandable before and after values", async () => {
    const user = userEvent.setup();
    vi.mocked(getReleaseSnapshot).mockResolvedValueOnce({
      Airlines: [{ stable_key: "air", name: "Example Air", is_enabled: true }]
    });
    renderAdmin(<AdminPage section="releases" />);
    await screen.findByRole("heading", { name: "Releases" });
    expect(getReleaseSnapshot).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "View changes" }));
    expect(await screen.findByText("1 added · 0 edited · 0 removed")).toBeVisible();
    await user.click(screen.getByText("Example Air"));
    expect(screen.getByText("After: Yes")).toBeVisible();
    expect(getReleaseSnapshot).toHaveBeenCalledWith("draft-1");
  });
  it("shows stored defaults as read-only rather than offering unused runtime settings", async () => {
    renderAdmin(<AdminPage section="defaults" />);
    expect(
      await screen.findByText(/Stored values are not currently used by the app/)
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "Save default" })).not.toBeInTheDocument();
  });
  it("previews real document and booking surfaces without changing the active palette", async () => {
    const activePalette = document.documentElement.style.cssText;
    renderAdmin(<AdminPage section="appearance" />);
    const preview = await screen.findByLabelText("light app preview");
    expect(preview.querySelector(".event-hero")).toBeInTheDocument();
    expect(preview.querySelector("[data-document-metadata]")).toBeInTheDocument();
    await userEvent.clear(screen.getByRole("textbox", { name: "Light brand hex" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Light brand hex" }), "#125555");
    expect(preview.style.getPropertyValue("--color-brand")).toBe("18 85 85");
    expect(document.documentElement.style.cssText).toBe(activePalette);
  });

  it("keeps overview navigation concise with secondary explanations collapsed", async () => {
    renderAdmin(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Admin overview" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Administrator sections" });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you can manage" })).toBeInTheDocument();
    const help = screen.getByText("About admin").closest("details");
    expect(help).not.toHaveAttribute("open");
    expect(screen.queryByText("Application configuration")).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Airlines/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Releases/ })).toHaveLength(2);
  });

  it("labels catalog fields and filters a large catalog without changing the draft", async () => {
    const user = userEvent.setup();
    renderAdmin(<AdminPage section="airlines" />);

    expect(await screen.findByRole("heading", { name: "Airline catalog" })).toBeInTheDocument();
    expect(screen.getByText("Draft · Changes go live when published")).toBeInTheDocument();
    expect(screen.queryByText("Release draft")).not.toBeInTheDocument();
    expect(screen.queryByText(/Review every airline available/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Airline name/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add airline" }));
    expect(screen.getByLabelText(/Airline name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Stable key/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByText("Air India")).toBeInTheDocument();
    expect(screen.getByText("Vistara")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: /Search airlines/ }), "vistara");
    await waitFor(() => expect(screen.queryByText("Air India")).not.toBeInTheDocument());
    expect(screen.getByText("Vistara")).toBeInTheDocument();
    expect(screen.getByText("1 airline")).toBeInTheDocument();
  });

  it("shows built-in travel catalogs and lets an airline be copied into the draft", async () => {
    const user = userEvent.setup();
    const { unmount } = renderAdmin(<AdminPage section="airlines" />);

    expect(await screen.findByText("IndiGo")).toBeInTheDocument();
    expect(screen.getAllByText("Built in").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Customize IndiGo" }));
    expect(screen.getByRole("heading", { name: "Customize IndiGo" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Airline name/)).toHaveValue("IndiGo");

    unmount();
    renderAdmin(<AdminPage section="vendors" />);
    expect(
      await screen.findByRole("heading", { name: "Booking-vendor catalog" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Booking.com")).toBeInTheDocument();
  });

  it("shows the built-in journey operators with mode filtering", async () => {
    const user = userEvent.setup();
    renderAdmin(<AdminPage section="operators" />);

    expect(
      await screen.findByRole("heading", { name: "Journey operator catalog" })
    ).toBeInTheDocument();
    expect(screen.getByText("Indian Railways")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Journey type"), "ferry");
    expect(screen.getByText("BatamFast")).toBeInTheDocument();
    expect(screen.queryByText("Indian Railways")).not.toBeInTheDocument();
  });

  it.each([
    ["airports", "Airport catalog"],
    ["suggestions", "Catalog suggestions"],
    ["defaults", "Travel defaults"],
    ["appearance", "Light & dark appearance"],
    ["releases", "Releases"]
  ] as const)("renders the %s section with accessible navigation", async (section, title) => {
    renderAdmin(<AdminPage section={section} />);

    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Administrator sections" })).toBeInTheDocument();
  });
});
