import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
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
    getAdminAudit: vi.fn().mockResolvedValue([])
  };
});

import { AdminPage } from "./AdminPage";

function renderAdmin(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("administrator console", () => {
  beforeEach(() => vi.clearAllMocks());

  it("explains the release workflow and exposes section navigation", async () => {
    renderAdmin(<AdminPage />);

    expect(await screen.findByRole("heading", { name: "Admin overview" })).toBeInTheDocument();
    const navigation = screen.getByRole("navigation", { name: "Administrator sections" });
    expect(navigation).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you can manage" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How changes go live" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Airlines/ })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /Releases/ })).toHaveLength(2);
  });

  it("labels catalog fields and filters a large catalog without changing the draft", async () => {
    const user = userEvent.setup();
    renderAdmin(<AdminPage section="airlines" />);

    expect(await screen.findByRole("heading", { name: "Airline catalog" })).toBeInTheDocument();
    expect(screen.getByText("Editing the open draft")).toBeInTheDocument();
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
