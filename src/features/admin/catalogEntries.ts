import starterAirlines from "../metadata/starter-airlines.json";
import starterAirports from "../metadata/starter-airports.json";
import starterVendors from "../metadata/starter-vendors.json";
import type { AirlineEntry, AirportEntry, VendorEntry } from "./api";

export type CatalogEntrySource = "release" | "built_in";

export type AdminAirlineEntry = AirlineEntry & { catalog_source: CatalogEntrySource };
export type AdminAirportEntry = AirportEntry & { catalog_source: CatalogEntrySource };
export type AdminVendorEntry = VendorEntry & { catalog_source: CatalogEntrySource };

function normalized(value: string | null | undefined) {
  return value?.trim().toLocaleLowerCase() ?? "";
}

export function mergeAdminAirlines(
  releaseEntries: AirlineEntry[],
  releaseId: string
): AdminAirlineEntry[] {
  const releaseKeys = new Set(releaseEntries.map((entry) => normalized(entry.stable_key)));
  const releaseNames = new Set(releaseEntries.map((entry) => normalized(entry.name)));
  const releaseCodes = new Set(releaseEntries.map((entry) => normalized(entry.iata_code)));
  return [
    ...releaseEntries.map((entry) => ({ ...entry, catalog_source: "release" as const })),
    ...starterAirlines
      .filter(
        (entry) =>
          !releaseKeys.has(normalized(entry.stableKey)) &&
          !releaseNames.has(normalized(entry.name)) &&
          !releaseCodes.has(normalized(entry.iataCode))
      )
      .map((entry, index) => ({
        id: `built-in:${entry.stableKey}`,
        config_release_id: releaseId,
        stable_key: entry.stableKey,
        name: entry.name,
        iata_code: entry.iataCode,
        icao_code: null,
        aliases: [],
        check_in_url_template: entry.checkInUrlTemplate,
        manage_booking_url_template: entry.manageBookingUrlTemplate,
        status_url_template: entry.statusUrlTemplate,
        tracker_url_template: entry.trackerUrlTemplate,
        brand_color: entry.brandColor,
        logo_asset_path: null,
        banner_asset_path: null,
        is_enabled: true,
        sort_order: releaseEntries.length + index,
        catalog_source: "built_in" as const
      }))
  ];
}

export function mergeAdminAirports(
  releaseEntries: AirportEntry[],
  releaseId: string
): AdminAirportEntry[] {
  const releaseKeys = new Set(releaseEntries.map((entry) => normalized(entry.stable_key)));
  const releaseCodes = new Set(releaseEntries.map((entry) => normalized(entry.iata_code)));
  return [
    ...releaseEntries.map((entry) => ({ ...entry, catalog_source: "release" as const })),
    ...starterAirports
      .filter(
        (entry) =>
          !releaseKeys.has(normalized(entry.stableKey)) &&
          !releaseCodes.has(normalized(entry.iataCode))
      )
      .map((entry, index) => ({
        id: `built-in:${entry.stableKey}`,
        config_release_id: releaseId,
        stable_key: entry.stableKey,
        iata_code: entry.iataCode,
        icao_code: null,
        name: entry.name,
        city: entry.city,
        country_code: entry.countryCode,
        timezone: entry.timezone,
        aliases: [],
        latitude: null,
        longitude: null,
        is_enabled: true,
        sort_order: releaseEntries.length + index,
        catalog_source: "built_in" as const
      }))
  ];
}

export function mergeAdminVendors(
  releaseEntries: VendorEntry[],
  releaseId: string
): AdminVendorEntry[] {
  const releaseKeys = new Set(releaseEntries.map((entry) => normalized(entry.stable_key)));
  const releaseNames = new Set(releaseEntries.map((entry) => normalized(entry.name)));
  return [
    ...releaseEntries.map((entry) => ({ ...entry, catalog_source: "release" as const })),
    ...starterVendors
      .filter(
        (entry) =>
          !releaseKeys.has(normalized(entry.stableKey)) && !releaseNames.has(normalized(entry.name))
      )
      .map((entry, index) => ({
        id: `built-in:${entry.stableKey}`,
        config_release_id: releaseId,
        stable_key: entry.stableKey,
        name: entry.name,
        aliases: [],
        website_url: entry.websiteUrl,
        logo_asset_path: null,
        brand_color: entry.brandColor,
        is_enabled: true,
        sort_order: releaseEntries.length + index,
        catalog_source: "built_in" as const
      }))
  ];
}
