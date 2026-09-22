import { supabase } from "../../lib/supabase/client";
import { validateCatalogAssetFile } from "./validation";

function client() {
  if (!supabase) throw new Error("Supabase is not connected.");
  return supabase;
}
async function userId() {
  const { data, error } = await client().auth.getUser();
  if (error || !data.user) throw error ?? new Error("Sign in required.");
  return data.user.id;
}

export type ConfigRelease = {
  id: string;
  version_number: number | null;
  status: "draft" | "published" | "retired";
  based_on_release_id: string | null;
  change_note: string;
  created_at: string;
  published_at: string | null;
};
export type AirlineEntry = {
  id: string;
  config_release_id: string;
  stable_key: string;
  name: string;
  iata_code: string | null;
  icao_code: string | null;
  aliases: string[];
  check_in_url_template: string | null;
  manage_booking_url_template: string | null;
  status_url_template: string | null;
  tracker_url_template: string | null;
  brand_color: string | null;
  logo_asset_path: string | null;
  banner_asset_path: string | null;
  is_enabled: boolean;
  sort_order: number;
};
export type AirportEntry = {
  id: string;
  config_release_id: string;
  stable_key: string;
  iata_code: string | null;
  icao_code: string | null;
  name: string;
  city: string;
  country_code: string;
  timezone: string;
  aliases: string[];
  latitude: number | null;
  longitude: number | null;
  is_enabled: boolean;
  sort_order: number;
};
export type VendorEntry = {
  id: string;
  config_release_id: string;
  stable_key: string;
  name: string;
  aliases: string[];
  website_url: string | null;
  logo_asset_path: string | null;
  brand_color: string | null;
  is_enabled: boolean;
  sort_order: number;
};
export type CatalogSuggestion = {
  id: string;
  suggestion_type: "airline" | "airport" | "booking_vendor" | "service_provider";
  display_value: string;
  normalized_value: string;
  proposed_data: Record<string, unknown>;
  status: "pending" | "promoted" | "merged" | "rejected";
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};
export type ThemeTokens = {
  canvas: string;
  surface: string;
  elevated: string;
  ink: string;
  muted: string;
  line: string;
  brand: string;
  brandSoft: string;
  coral: string;
  success: string;
  warning: string;
  danger: string;
};

export const legacyLightTokens: ThemeTokens = {
  canvas: "#f5f1e8",
  surface: "#fffdf8",
  elevated: "#ffffff",
  ink: "#182728",
  muted: "#5d6b6a",
  line: "#d8d3c7",
  brand: "#142f31",
  brandSoft: "#dde9e5",
  coral: "#e8785b",
  success: "#2f7a60",
  warning: "#b06f28",
  danger: "#b04441"
};
export const legacyDarkTokens: ThemeTokens = {
  canvas: "#101819",
  surface: "#182223",
  elevated: "#1f2b2c",
  ink: "#eef0e9",
  muted: "#abb8b3",
  line: "#3a4949",
  brand: "#b4dcd0",
  brandSoft: "#26413e",
  coral: "#f49174",
  success: "#6fc7a3",
  warning: "#e8ae5c",
  danger: "#f1837e"
};

export const defaultLightTokens: ThemeTokens = {
  canvas: "#f5f7fa",
  surface: "#ffffff",
  elevated: "#eef3f6",
  ink: "#20323d",
  muted: "#526674",
  line: "#a3b2bc",
  brand: "#146b67",
  brandSoft: "#ddefea",
  coral: "#4259b8",
  success: "#24724b",
  warning: "#8a5a13",
  danger: "#b33f47"
};
export const defaultDarkTokens: ThemeTokens = {
  canvas: "#10191f",
  surface: "#18252d",
  elevated: "#20313a",
  ink: "#edf4f5",
  muted: "#a8bac3",
  line: "#536a78",
  brand: "#79d5ca",
  brandSoft: "#203f40",
  coral: "#a9b7ff",
  success: "#7ed4a8",
  warning: "#f2c475",
  danger: "#ffaca7"
};

export async function isCurrentUserAdmin() {
  const id = await userId();
  const { data } = await client()
    .from("app_admins")
    .select("user_id")
    .eq("user_id", id)
    .eq("status", "active")
    .maybeSingle();
  return Boolean(data);
}
export async function listConfigReleases(): Promise<ConfigRelease[]> {
  const { data, error } = await client()
    .from("config_releases")
    .select("id,version_number,status,based_on_release_id,change_note,created_at,published_at")
    .or("status.neq.retired,version_number.not.is.null")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ConfigRelease[];
}
export async function createConfigDraft(note: string) {
  const { data, error } = await client().rpc("create_config_draft", {
    requested_change_note: note
  });
  if (error) throw error;
  return String(data);
}
export async function publishRelease(id: string) {
  const { data, error } = await client().rpc("publish_config_release", {
    requested_release_id: id
  });
  if (error) throw error;
  return Number(data);
}
export async function rollbackRelease(id: string) {
  const { data, error } = await client().rpc("rollback_config_release", {
    requested_release_id: id
  });
  if (error) throw error;
  return Number(data);
}

export async function discardConfigDraft(id: string) {
  const { error } = await client().rpc("discard_config_draft", { requested_release_id: id });
  if (error?.code === "PGRST202" || error?.code === "42883")
    throw new Error(
      "Draft deletion needs supabase/migrations/202609220004_admin_release_management.sql. Apply that migration on an existing database, not the complete setup."
    );
  if (error) throw error;
}

/** Raw release-owned data only: do not merge built-in catalogues or fallback palettes. */
export async function getReleaseSnapshot(
  releaseId: string
): Promise<import("./releaseChanges").ReleaseSnapshot> {
  const sections = [
    ["Airlines", "airline_catalog_entries"],
    ["Airports", "airport_catalog_entries"],
    ["Booking vendors", "booking_vendor_catalog_entries"],
    ["Defaults", "metadata_defaults"],
    ["Appearance", "theme_palettes"]
  ] as const;
  const result = await Promise.all(
    sections.map(async ([name, table]) => {
      const rows: Record<string, unknown>[] = [];
      for (let start = 0; ; start += 500) {
        let query = client().from(table).select("*").eq("config_release_id", releaseId);
        query =
          table === "metadata_defaults"
            ? query.order("namespace").order("key")
            : query.order(table === "theme_palettes" ? "config_release_id" : "stable_key");
        const { data, error } = await query.range(start, start + 499);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < 500) break;
      }
      return [
        name,
        name === "Appearance"
          ? rows.flatMap((row) => [
              {
                stable_key: "light",
                name: "Light palette",
                ...(row.light_tokens as Record<string, unknown>)
              },
              {
                stable_key: "dark",
                name: "Dark palette",
                ...(row.dark_tokens as Record<string, unknown>)
              }
            ])
          : rows
      ] as const;
    })
  );
  return Object.fromEntries(result);
}

export async function listAirlines(releaseId: string): Promise<AirlineEntry[]> {
  const { data, error } = await client()
    .from("airline_catalog_entries")
    .select(
      "id,config_release_id,stable_key,name,iata_code,icao_code,aliases,check_in_url_template,manage_booking_url_template,status_url_template,tracker_url_template,brand_color,logo_asset_path,banner_asset_path,is_enabled,sort_order"
    )
    .eq("config_release_id", releaseId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as AirlineEntry[];
}
export async function saveAirline(input: Omit<AirlineEntry, "id"> & { id?: string }) {
  const actor = await userId();
  const payload = { ...input, updated_by: actor };
  const query = input.id
    ? client().from("airline_catalog_entries").update(payload).eq("id", input.id)
    : client().from("airline_catalog_entries").insert(payload);
  const { error } = await query;
  if (error) throw error;
}
export async function deleteAirline(id: string) {
  const { error } = await client().from("airline_catalog_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function uploadCatalogAsset(
  file: File,
  releaseId: string,
  stableKey: string,
  kind: "logo" | "banner"
) {
  const extensions: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp"
  };
  const validationIssue = validateCatalogAssetFile(file);
  if (validationIssue) throw new Error(validationIssue);
  const extension = extensions[file.type];
  if (!extension) throw new Error("Catalog asset type is not supported.");
  const safeKey =
    stableKey
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "asset";
  const path = `catalog/releases/${releaseId}/${safeKey}/${crypto.randomUUID()}-${kind}.${extension}`;
  const { error } = await client()
    .storage.from("catalog-assets")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function listAirports(releaseId: string): Promise<AirportEntry[]> {
  const { data, error } = await client()
    .from("airport_catalog_entries")
    .select(
      "id,config_release_id,stable_key,iata_code,icao_code,name,city,country_code,timezone,aliases,latitude,longitude,is_enabled,sort_order"
    )
    .eq("config_release_id", releaseId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as AirportEntry[];
}
export async function saveAirport(input: Omit<AirportEntry, "id"> & { id?: string }) {
  const actor = await userId();
  const payload = { ...input, updated_by: actor };
  const query = input.id
    ? client().from("airport_catalog_entries").update(payload).eq("id", input.id)
    : client().from("airport_catalog_entries").insert(payload);
  const { error } = await query;
  if (error) throw error;
}
export async function deleteAirport(id: string) {
  const { error } = await client().from("airport_catalog_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function listVendors(releaseId: string): Promise<VendorEntry[]> {
  const { data, error } = await client()
    .from("booking_vendor_catalog_entries")
    .select(
      "id,config_release_id,stable_key,name,aliases,website_url,logo_asset_path,brand_color,is_enabled,sort_order"
    )
    .eq("config_release_id", releaseId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as VendorEntry[];
}
export async function saveVendor(input: Omit<VendorEntry, "id"> & { id?: string }) {
  const actor = await userId();
  const payload = { ...input, updated_by: actor };
  const query = input.id
    ? client().from("booking_vendor_catalog_entries").update(payload).eq("id", input.id)
    : client().from("booking_vendor_catalog_entries").insert(payload);
  const { error } = await query;
  if (error) throw error;
}
export async function deleteVendor(id: string) {
  const { error } = await client().from("booking_vendor_catalog_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function listCatalogSuggestions(): Promise<CatalogSuggestion[]> {
  const { data, error } = await client()
    .from("catalog_suggestions")
    .select(
      "id,suggestion_type,display_value,normalized_value,proposed_data,status,review_note,created_at,reviewed_at"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as CatalogSuggestion[];
}
export async function reviewCatalogSuggestion(
  id: string,
  status: Exclude<CatalogSuggestion["status"], "pending">,
  note?: string
) {
  const actor = await userId();
  const { error } = await client()
    .from("catalog_suggestions")
    .update({
      status,
      review_note: note || null,
      reviewed_by: actor,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", id);
  if (error) throw error;
}

export async function listDefaults(releaseId: string) {
  const { data, error } = await client()
    .from("metadata_defaults")
    .select("config_release_id,namespace,key,value,updated_at")
    .eq("config_release_id", releaseId)
    .order("namespace")
    .order("key");
  if (error) throw error;
  return data ?? [];
}
export async function saveDefault(input: {
  config_release_id: string;
  namespace: string;
  key: string;
  value: unknown;
}) {
  const actor = await userId();
  const { error } = await client()
    .from("metadata_defaults")
    .upsert({ ...input, updated_by: actor });
  if (error) throw error;
}

export async function getThemePalette(releaseId: string) {
  const { data, error } = await client()
    .from("theme_palettes")
    .select("light_tokens,dark_tokens")
    .eq("config_release_id", releaseId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? { light: data.light_tokens as ThemeTokens, dark: data.dark_tokens as ThemeTokens }
    : { light: defaultLightTokens, dark: defaultDarkTokens };
}
export async function saveThemePalette(releaseId: string, light: ThemeTokens, dark: ThemeTokens) {
  const actor = await userId();
  const { error } = await client().from("theme_palettes").upsert({
    config_release_id: releaseId,
    light_tokens: light,
    dark_tokens: dark,
    updated_by: actor
  });
  if (error) throw error;
}

export async function getAdminAudit() {
  const { data, error } = await client()
    .from("config_audit_events")
    .select("id,config_release_id,action,safe_summary,created_at")
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}
