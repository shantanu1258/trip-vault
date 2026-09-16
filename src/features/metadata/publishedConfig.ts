import { database } from "../../lib/local-db/database";
import { supabase } from "../../lib/supabase/client";
import { isValidTimeZone } from "../trips/validation";
import { validateActionUrl, validateThemeTokens } from "../admin/validation";
import type { AirlineEntry, AirportEntry, ThemeTokens, VendorEntry } from "../admin/api";
import starterAirlines from "./starter-airlines.json";
import starterAirports from "./starter-airports.json";
import starterVendors from "./starter-vendors.json";
import { cachePublishedPalette, readCachedPalette } from "../../lib/theme/publishedPalette";

const PUBLIC_PROFILE = "published-configuration";
const VERSION_KEY = "published-configuration:version";

export type AvailableAirline = {
  stableKey: string;
  name: string;
  iataCode: string | null;
  icaoCode: string | null;
  checkInUrlTemplate: string | null;
  manageBookingUrlTemplate: string | null;
  statusUrlTemplate: string | null;
  trackerUrlTemplate: string | null;
  brandColor: string | null;
  logoAssetPath: string | null;
  bannerAssetPath: string | null;
  sourceVersion: number;
};

export type AvailableAirport = {
  stableKey: string;
  iataCode: string | null;
  icaoCode: string | null;
  name: string;
  city: string;
  countryCode: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  sourceVersion: number;
};

export type AvailableVendor = {
  stableKey: string;
  name: string;
  websiteUrl: string | null;
  brandColor: string | null;
  logoAssetPath: string | null;
  sourceVersion: number;
};

export async function refreshPublishedConfiguration() {
  if (!supabase || !navigator.onLine) return false;
  const { data: release, error: releaseError } = await supabase
    .from("config_releases")
    .select("id,version_number")
    .eq("status", "published")
    .maybeSingle();
  if (releaseError || !release?.id || !release.version_number) return false;
  const cachedVersion = Number((await database.settings.get(VERSION_KEY))?.value ?? 0);
  if (
    cachedVersion === Number(release.version_number) &&
    readCachedPalette().version === Number(release.version_number)
  )
    return false;
  const [airlinesResult, airportsResult, vendorsResult, defaultsResult, paletteResult] =
    await Promise.all([
      supabase
        .from("airline_catalog_entries")
        .select("*")
        .eq("config_release_id", release.id)
        .order("sort_order"),
      supabase
        .from("airport_catalog_entries")
        .select("*")
        .eq("config_release_id", release.id)
        .order("sort_order"),
      supabase
        .from("booking_vendor_catalog_entries")
        .select("*")
        .eq("config_release_id", release.id)
        .order("sort_order"),
      supabase.from("metadata_defaults").select("*").eq("config_release_id", release.id),
      supabase
        .from("theme_palettes")
        .select("light_tokens,dark_tokens")
        .eq("config_release_id", release.id)
        .maybeSingle()
    ]);
  const failure = [
    airlinesResult,
    airportsResult,
    vendorsResult,
    defaultsResult,
    paletteResult
  ].find((result) => result.error)?.error;
  if (failure) throw failure;
  const airlines = (airlinesResult.data ?? []) as AirlineEntry[];
  const airports = (airportsResult.data ?? []) as AirportEntry[];
  const palette = paletteResult.data as {
    light_tokens: ThemeTokens;
    dark_tokens: ThemeTokens;
  } | null;
  if (
    !palette ||
    validateThemeTokens(palette.light_tokens) ||
    validateThemeTokens(palette.dark_tokens)
  )
    return false;
  if (
    airlines.some((airline) =>
      [
        airline.check_in_url_template,
        airline.manage_booking_url_template,
        airline.status_url_template,
        airline.tracker_url_template
      ].some((url) => url && !validateActionUrl(url))
    )
  )
    return false;
  if (airports.some((airport) => !isValidTimeZone(airport.timezone))) return false;
  const now = new Date().toISOString();
  await database.transaction("rw", database.entities, database.settings, async () => {
    await database.entities.where("profileId").equals(PUBLIC_PROFILE).delete();
    await database.entities.bulkPut([
      ...airlines.map((data) => ({
        profileId: PUBLIC_PROFILE,
        entityType: "airline-catalog",
        id: data.id,
        data,
        updatedAt: now
      })),
      ...airports.map((data) => ({
        profileId: PUBLIC_PROFILE,
        entityType: "airport-catalog",
        id: data.id,
        data,
        updatedAt: now
      })),
      ...(vendorsResult.data ?? []).map((data) => ({
        profileId: PUBLIC_PROFILE,
        entityType: "vendor-catalog",
        id: data.id,
        data,
        updatedAt: now
      })),
      ...(defaultsResult.data ?? []).map((data) => ({
        profileId: PUBLIC_PROFILE,
        entityType: "metadata-defaults",
        id: `${data.namespace}:${data.key}`,
        data,
        updatedAt: now
      })),
      {
        profileId: PUBLIC_PROFILE,
        entityType: "theme-palette",
        id: String(release.version_number),
        data: palette,
        updatedAt: now
      }
    ]);
    await database.settings.put({
      key: VERSION_KEY,
      value: String(release.version_number),
      updatedAt: now
    });
  });
  cachePublishedPalette({
    version: Number(release.version_number),
    light: palette.light_tokens,
    dark: palette.dark_tokens
  });
  return true;
}

export async function listAvailableAirlines(): Promise<AvailableAirline[]> {
  const version = Number((await database.settings.get(VERSION_KEY))?.value ?? 0);
  const published = (
    await database.entities
      .where("[profileId+entityType]")
      .equals([PUBLIC_PROFILE, "airline-catalog"])
      .toArray()
  ).map((row) => row.data as AirlineEntry);
  return mergeAvailableAirlines(published, version);
}

export function mergeAvailableAirlines(
  published: AirlineEntry[],
  version: number
): AvailableAirline[] {
  const overridden = new Set(
    published
      .flatMap((airline) => [airline.stable_key, airline.name, airline.iata_code ?? ""])
      .filter(Boolean)
      .map((value) => value.toLocaleLowerCase())
  );
  const mapped = published
    .filter((airline) => airline.is_enabled)
    .map((airline) => ({
      stableKey: airline.stable_key,
      name: airline.name,
      iataCode: airline.iata_code,
      icaoCode: airline.icao_code,
      checkInUrlTemplate: airline.check_in_url_template,
      manageBookingUrlTemplate: airline.manage_booking_url_template,
      statusUrlTemplate: airline.status_url_template,
      trackerUrlTemplate: airline.tracker_url_template,
      brandColor: airline.brand_color,
      logoAssetPath: airline.logo_asset_path,
      bannerAssetPath: airline.banner_asset_path,
      sourceVersion: version
    }));
  return [
    ...mapped,
    ...starterAirlines
      .filter(
        (airline) =>
          ![airline.stableKey, airline.name, airline.iataCode].some((value) =>
            overridden.has(value.toLocaleLowerCase())
          )
      )
      .map((airline) => ({
        stableKey: airline.stableKey,
        name: airline.name,
        iataCode: airline.iataCode,
        icaoCode: null,
        checkInUrlTemplate: airline.checkInUrlTemplate,
        manageBookingUrlTemplate: airline.manageBookingUrlTemplate,
        statusUrlTemplate: airline.statusUrlTemplate,
        trackerUrlTemplate: airline.trackerUrlTemplate,
        brandColor: airline.brandColor,
        logoAssetPath: null,
        bannerAssetPath: null,
        sourceVersion: 0
      }))
  ];
}

export async function listAvailableAirports(): Promise<AvailableAirport[]> {
  const version = Number((await database.settings.get(VERSION_KEY))?.value ?? 0);
  const published = (
    await database.entities
      .where("[profileId+entityType]")
      .equals([PUBLIC_PROFILE, "airport-catalog"])
      .toArray()
  ).map((row) => row.data as AirportEntry);
  return mergeAvailableAirports(published, version);
}

export function mergeAvailableAirports(
  published: AirportEntry[],
  version: number
): AvailableAirport[] {
  const keys = new Set(
    published
      .flatMap((airport) => [airport.stable_key, airport.iata_code ?? ""])
      .filter(Boolean)
      .map((value) => value.toLocaleLowerCase())
  );
  const mapped = published
    .filter((airport) => airport.is_enabled)
    .map((airport) => ({
      stableKey: airport.stable_key,
      iataCode: airport.iata_code,
      icaoCode: airport.icao_code,
      name: airport.name,
      city: airport.city,
      countryCode: airport.country_code,
      timezone: airport.timezone,
      latitude: airport.latitude,
      longitude: airport.longitude,
      sourceVersion: version
    }));
  return [
    ...mapped,
    ...starterAirports
      .filter(
        (airport) =>
          !keys.has(airport.stableKey.toLocaleLowerCase()) &&
          !keys.has(airport.iataCode.toLocaleLowerCase())
      )
      .map((airport) => ({
        ...airport,
        icaoCode: null,
        latitude: null,
        longitude: null,
        sourceVersion: 0
      }))
  ];
}

export async function listAvailableVendors(): Promise<AvailableVendor[]> {
  const version = Number((await database.settings.get(VERSION_KEY))?.value ?? 0);
  const published = (
    await database.entities
      .where("[profileId+entityType]")
      .equals([PUBLIC_PROFILE, "vendor-catalog"])
      .toArray()
  ).map((row) => row.data as VendorEntry);
  return mergeAvailableVendors(published, version);
}

export function mergeAvailableVendors(
  published: VendorEntry[],
  version: number
): AvailableVendor[] {
  const overridden = new Set(
    published
      .flatMap((vendor) => [vendor.stable_key, vendor.name])
      .map((value) => value.toLocaleLowerCase())
  );
  const mapped = published
    .filter((vendor) => vendor.is_enabled)
    .map((vendor) => ({
      stableKey: vendor.stable_key,
      name: vendor.name,
      websiteUrl: vendor.website_url,
      brandColor: vendor.brand_color,
      logoAssetPath: vendor.logo_asset_path,
      sourceVersion: version
    }));
  return [
    ...mapped,
    ...starterVendors
      .filter(
        (vendor) =>
          ![vendor.stableKey, vendor.name].some((value) =>
            overridden.has(value.toLocaleLowerCase())
          )
      )
      .map((vendor) => ({ ...vendor, logoAssetPath: null, sourceVersion: 0 }))
  ];
}
