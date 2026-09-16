import { describe, expect, it } from "vitest";
import type { AirlineEntry, AirportEntry, VendorEntry } from "./api";
import { mergeAdminAirlines, mergeAdminAirports, mergeAdminVendors } from "./catalogEntries";

describe("admin catalog entries", () => {
  it("shows release airlines first and does not repeat their built-in fallback", () => {
    const releaseEntry = {
      id: "managed-air-india",
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
      brand_color: null,
      logo_asset_path: null,
      banner_asset_path: null,
      is_enabled: true,
      sort_order: 0
    } satisfies AirlineEntry;

    const entries = mergeAdminAirlines([releaseEntry], "draft-1");

    expect(entries[0]).toMatchObject({ id: "managed-air-india", catalog_source: "release" });
    expect(entries.filter((entry) => entry.name === "Air India")).toHaveLength(1);
    expect(entries.find((entry) => entry.name === "IndiGo")).toMatchObject({
      catalog_source: "built_in"
    });
  });

  it("includes the built-in airports and vendors when a release has none", () => {
    expect(mergeAdminAirports([] as AirportEntry[], "draft-1")[0]).toMatchObject({
      iata_code: "DEL",
      catalog_source: "built_in"
    });
    expect(mergeAdminVendors([] as VendorEntry[], "draft-1")[0]).toMatchObject({
      name: "Booking.com",
      catalog_source: "built_in"
    });
  });
});
