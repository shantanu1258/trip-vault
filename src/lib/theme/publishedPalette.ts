import {
  defaultDarkTokens,
  defaultLightTokens,
  legacyLightTokens,
  legacyDarkTokens,
  type ThemeTokens
} from "../../features/admin/api";
import { validateThemeTokens } from "../../features/admin/validation";
import type { CSSProperties } from "react";

export const PALETTE_KEY = "trip-vault:published-palette";
export const PALETTE_UPDATED_EVENT = "trip-vault:palette-updated";
const variableMap: Record<keyof ThemeTokens, string> = {
  canvas: "--color-canvas",
  surface: "--color-surface",
  elevated: "--color-elevated",
  ink: "--color-ink",
  muted: "--color-muted",
  line: "--color-line",
  brand: "--color-brand",
  brandSoft: "--color-brand-soft",
  coral: "--color-coral",
  success: "--color-success",
  warning: "--color-warning",
  danger: "--color-danger"
};

export type PublishedPalette = { version: number; light: ThemeTokens; dark: ThemeTokens };

function validPalette(value: unknown): value is PublishedPalette {
  if (!value || typeof value !== "object") return false;
  const palette = value as PublishedPalette;
  return (
    Number.isInteger(palette.version) &&
    !validateThemeTokens(palette.light) &&
    !validateThemeTokens(palette.dark)
  );
}

export function readCachedPalette(): PublishedPalette {
  try {
    const parsed = JSON.parse(localStorage.getItem(PALETTE_KEY) ?? "null");
    if (validPalette(parsed))
      return {
        ...parsed,
        // Upgrade only the exact original stock palette. Any admin customization wins.
        light: isStockPalette(parsed.light, legacyLightTokens) ? defaultLightTokens : parsed.light,
        dark: isStockPalette(parsed.dark, legacyDarkTokens) ? defaultDarkTokens : parsed.dark
      };
  } catch {
    /* use bundled fallback */
  }
  return { version: 0, light: defaultLightTokens, dark: defaultDarkTokens };
}

function isStockPalette(tokens: ThemeTokens, stock: ThemeTokens) {
  return Object.keys(stock).every(
    (key) => tokens[key as keyof ThemeTokens].toLowerCase() === stock[key as keyof ThemeTokens]
  );
}

function hexToChannels(hex: string) {
  return [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)]
    .map((part) => Number.parseInt(part, 16))
    .join(" ");
}
export function applyPublishedPalette(palette: PublishedPalette, mode: "light" | "dark") {
  const tokens = palette[mode];
  for (const [key, variable] of Object.entries(variableMap))
    document.documentElement.style.setProperty(
      variable,
      hexToChannels(tokens[key as keyof ThemeTokens])
    );
}

/** Scoped preview variables; never changes the user's active app theme. */
export function themePreviewStyle(tokens: ThemeTokens): CSSProperties {
  return Object.fromEntries(
    Object.entries(variableMap).map(([key, variable]) => [
      variable,
      hexToChannels(
        /^#[0-9a-f]{6}$/i.test(tokens[key as keyof ThemeTokens])
          ? tokens[key as keyof ThemeTokens]
          : defaultLightTokens[key as keyof ThemeTokens]
      )
    ])
  ) as CSSProperties;
}

export function cachePublishedPalette(palette: PublishedPalette) {
  if (!validPalette(palette)) throw new Error("Published palette is invalid.");
  localStorage.setItem(PALETTE_KEY, JSON.stringify(palette));
  window.dispatchEvent(new Event(PALETTE_UPDATED_EVENT));
}
