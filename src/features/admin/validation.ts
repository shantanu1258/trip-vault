import type { ThemeTokens } from "./api";

const HEX = /^#[0-9a-fA-F]{6}$/;
const allowedPlaceholders = new Set([
  "flightNumber",
  "airlineCode",
  "departureDate",
  "bookingReference",
  "departureAirport",
  "arrivalAirport"
]);

export function validateActionUrl(value: string) {
  if (!value) return true;
  try {
    const placeholders = [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
    return (
      new URL(value.replace(/\{[^}]+\}/g, "example")).protocol === "https:" &&
      placeholders.every((item) => allowedPlaceholders.has(item))
    );
  } catch {
    return false;
  }
}

export function validateCatalogAssetPath(value: string) {
  return (
    !value ||
    (!value.includes("..") && /^[a-zA-Z0-9][a-zA-Z0-9/_-]*\.(png|jpe?g|webp)$/i.test(value))
  );
}

export function validateCatalogAssetFile(file: Pick<File, "size" | "type">) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    return "Catalog assets must be PNG, JPEG, or WebP images.";
  if (file.size > 2_000_000) return "Catalog assets must be 2 MB or smaller.";
  return null;
}

export function expandActionUrl(template: string, values: Record<string, string>) {
  if (!validateActionUrl(template))
    throw new Error("The action link is not a safe HTTPS template.");
  return template.replace(/\{([^}]+)\}/g, (_, key: string) =>
    encodeURIComponent(values[key] ?? "")
  );
}

function rgb(hex: string) {
  return [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
}
export function contrastRatio(foreground: string, background: string) {
  const first = rgb(foreground);
  const second = rgb(background);
  const l1 = 0.2126 * first[0] + 0.7152 * first[1] + 0.0722 * first[2];
  const l2 = 0.2126 * second[0] + 0.7152 * second[1] + 0.0722 * second[2];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export function validateThemeTokens(tokens: ThemeTokens) {
  if (Object.values(tokens).some((value) => !HEX.test(value)))
    return "Every token must be a six-digit hex color.";
  if (
    contrastRatio(tokens.ink, tokens.canvas) < 4.5 ||
    contrastRatio(tokens.ink, tokens.surface) < 4.5
  )
    return "Primary text needs at least 4.5:1 contrast on canvas and surface.";
  if (contrastRatio(tokens.muted, tokens.surface) < 4.5)
    return "Muted text needs at least 4.5:1 contrast on the surface.";
  return null;
}
