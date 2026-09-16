import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  expandActionUrl,
  validateActionUrl,
  validateCatalogAssetFile,
  validateCatalogAssetPath,
  validateThemeTokens
} from "./validation";
import { defaultLightTokens } from "./api";

describe("administrator validation", () => {
  it("accepts allowlisted HTTPS placeholders", () =>
    expect(
      validateActionUrl("https://airline.example/status/{flightNumber}?date={departureDate}")
    ).toBe(true));
  it("rejects insecure and unknown placeholders", () => {
    expect(validateActionUrl("http://airline.example/{flightNumber}")).toBe(false);
    expect(validateActionUrl("https://airline.example/{script}")).toBe(false);
  });
  it("URL-encodes every expanded action value", () =>
    expect(
      expandActionUrl("https://airline.example/{flightNumber}", { flightNumber: "AI 101/2" })
    ).toBe("https://airline.example/AI%20101%2F2"));
  it("accepts bundled accessible palettes and rejects unsafe tokens", () => {
    expect(validateThemeTokens(defaultLightTokens)).toBeNull();
    expect(validateThemeTokens({ ...defaultLightTokens, ink: "red" })).toMatch(/six-digit/i);
  });
  it("calculates WCAG contrast", () => expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21));
  it("allows only safe catalog image paths", () => {
    expect(validateCatalogAssetPath("airlines/air-india/logo.webp")).toBe(true);
    expect(validateCatalogAssetPath("../private/passport.pdf")).toBe(false);
    expect(validateCatalogAssetPath("https://example.com/logo.png")).toBe(false);
  });
  it("enforces public catalog asset type and size", () => {
    expect(validateCatalogAssetFile({ type: "image/png", size: 2_000_000 })).toBeNull();
    expect(validateCatalogAssetFile({ type: "image/svg+xml", size: 100 })).toMatch(/PNG/i);
    expect(validateCatalogAssetFile({ type: "image/webp", size: 2_000_001 })).toMatch(/2 MB/i);
  });
});
