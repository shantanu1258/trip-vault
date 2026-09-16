import { describe, expect, it } from "vitest";
import type { AirlineEntry, AirportEntry, VendorEntry } from "../admin/api";
import {
  mergeAvailableAirlines,
  mergeAvailableAirports,
  mergeAvailableVendors
} from "./publishedConfig";

describe("published catalog fallbacks", () => {
  it("does not resurrect a disabled built-in airline", () => {
    const disabled = {
      id: "air-india",
      config_release_id: "release-1",
      stable_key: "air-india",
      name: "Air India",
      iata_code: "AI",
      icao_code: null,
      aliases: [],
      check_in_url_template: null,
      manage_booking_url_template: null,
      status_url_template: null,
      tracker_url_template: null,
      brand_color: null,
      logo_asset_path: null,
      banner_asset_path: null,
      is_enabled: false,
      sort_order: 0
    } satisfies AirlineEntry;

    expect(mergeAvailableAirlines([disabled], 2).some((entry) => entry.name === "Air India")).toBe(
      false
    );
  });

  it("honors disabled airport and vendor overrides too", () => {
    const airport = {
      id: "del",
      config_release_id: "release-1",
      stable_key: "del",
      iata_code: "DEL",
      icao_code: null,
      name: "Indira Gandhi International Airport",
      city: "Delhi",
      country_code: "IN",
      timezone: "Asia/Kolkata",
      aliases: [],
      latitude: null,
      longitude: null,
      is_enabled: false,
      sort_order: 0
    } satisfies AirportEntry;
    const vendor = {
      id: "booking-com",
      config_release_id: "release-1",
      stable_key: "booking-com",
      name: "Booking.com",
      aliases: [],
      website_url: "https://www.booking.com",
      logo_asset_path: null,
      brand_color: null,
      is_enabled: false,
      sort_order: 0
    } satisfies VendorEntry;

    expect(mergeAvailableAirports([airport], 2).some((entry) => entry.iataCode === "DEL")).toBe(
      false
    );
    expect(mergeAvailableVendors([vendor], 2).some((entry) => entry.name === "Booking.com")).toBe(
      false
    );
  });
});
