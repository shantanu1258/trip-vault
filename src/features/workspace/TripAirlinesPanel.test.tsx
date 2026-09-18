import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listTripAirlines: vi.fn().mockResolvedValue([
    {
      id: "airline-1",
      trip_id: "trip-1",
      name: "Air India",
      iata_code: "AI",
      icao_code: "AIC",
      check_in_url_template: null,
      manage_booking_url_template: null,
      status_url_template: null,
      tracker_url_template: null,
      brand_color: "#142f31",
      metadata_source: "catalog",
      source_catalog_key: "air-india",
      source_config_version: 1,
      version: 1
    }
  ]),
  updateTripAirline: vi.fn()
}));

vi.mock("./api", () => ({
  listTripAirlines: mocks.listTripAirlines,
  updateTripAirline: mocks.updateTripAirline
}));

import { TripAirlinesPanel } from "./TripAirlinesPanel";

function renderPanel(canEdit: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TripAirlinesPanel tripId="trip-1" canEdit={canEdit} />
    </QueryClientProvider>
  );
}

describe("trip airline cards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateTripAirline.mockImplementation(async (airline) => airline);
  });

  it("opens the inline editor from the whole card when editing is allowed", async () => {
    renderPanel(true);

    const card = await screen.findByRole("button", { name: "Edit Air India" });
    expect(card.style.getPropertyValue("--airline-accent")).toBe("#142f31");
    await userEvent.click(card);

    expect(screen.getByText("Edit airline snapshot")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Air India")).toBeInTheDocument();
    expect(
      screen.getByTestId("airline-accent-preview").style.getPropertyValue("--airline-accent")
    ).toBe("#142f31");
  });

  it("stays informational for a viewer", async () => {
    renderPanel(false);

    expect(await screen.findByText("Air India")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Air India" })).not.toBeInTheDocument();
  });

  it("remounts the editor with the newly selected airline and saves only that identity", async () => {
    mocks.listTripAirlines.mockResolvedValueOnce([
      {
        id: "airline-1",
        trip_id: "trip-1",
        name: "Air India",
        iata_code: "AI",
        icao_code: "AIC",
        check_in_url_template: null,
        manage_booking_url_template: null,
        status_url_template: null,
        tracker_url_template: null,
        brand_color: "#142f31",
        metadata_source: "catalog",
        source_catalog_key: "air-india",
        source_config_version: 1,
        version: 1
      },
      {
        id: "airline-2",
        trip_id: "trip-1",
        name: "Singapore Airlines",
        iata_code: "SQ",
        icao_code: "SIA",
        check_in_url_template: null,
        manage_booking_url_template: null,
        status_url_template: null,
        tracker_url_template: null,
        brand_color: "#5c0632",
        metadata_source: "catalog",
        source_catalog_key: "singapore-airlines",
        source_config_version: 1,
        version: 4
      }
    ]);
    const user = userEvent.setup();
    renderPanel(true);

    await user.click(await screen.findByRole("button", { name: "Edit Air India" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Unsaved Air India draft");
    await user.type(screen.getByLabelText("Tracker link"), "http://invalid.example");
    await user.click(screen.getByRole("button", { name: "Save airline" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Action links must use HTTPS");

    await user.click(screen.getByRole("button", { name: "Edit Singapore Airlines" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Singapore Airlines");
    expect(screen.getByLabelText("IATA")).toHaveValue("SQ");
    expect(screen.getByLabelText("ICAO")).toHaveValue("SIA");
    expect(screen.getByLabelText("Tracker link")).toHaveValue("");
    expect(screen.getByLabelText("Card accent")).toHaveValue("#5c0632");

    await user.click(screen.getByRole("button", { name: "Save airline" }));
    expect(mocks.updateTripAirline).toHaveBeenCalledOnce();
    expect(mocks.updateTripAirline).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "airline-2",
        name: "Singapore Airlines",
        iata_code: "SQ",
        icao_code: "SIA",
        tracker_url_template: null,
        brand_color: "#5c0632",
        version: 4
      })
    );
  });
});
