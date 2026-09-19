import { describe, expect, it } from "vitest";
import {
  defaultDarkTokens,
  defaultLightTokens,
  legacyDarkTokens,
  legacyLightTokens
} from "../../features/admin/api";
import { contrastRatio } from "../../features/admin/validation";
import { resolveTheme } from "./ThemeProvider";
import { readCachedPalette } from "./publishedPalette";

describe("device theme", () => {
  it("resolves System, Light, and Dark deterministically", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
  it("falls back to bundled tokens when cached configuration is invalid", () => {
    localStorage.setItem(
      "trip-vault:published-palette",
      JSON.stringify({ version: 7, light: { ink: "javascript:" }, dark: {} })
    );
    expect(readCachedPalette()).toEqual({
      version: 0,
      light: defaultLightTokens,
      dark: defaultDarkTokens
    });
  });
  it("reads a complete accessible cached release atomically", () => {
    localStorage.setItem(
      "trip-vault:published-palette",
      JSON.stringify({ version: 3, light: defaultLightTokens, dark: defaultDarkTokens })
    );
    expect(readCachedPalette().version).toBe(3);
  });
  it("upgrades exact legacy defaults without overriding custom admin colors", () => {
    localStorage.setItem(
      "trip-vault:published-palette",
      JSON.stringify({ version: 2, light: legacyLightTokens, dark: legacyDarkTokens })
    );
    expect(readCachedPalette()).toEqual({
      version: 2,
      light: defaultLightTokens,
      dark: defaultDarkTokens
    });
    const custom = { ...legacyLightTokens, brand: "#225566" };
    localStorage.setItem(
      "trip-vault:published-palette",
      JSON.stringify({ version: 3, light: custom, dark: legacyDarkTokens })
    );
    expect(readCachedPalette().light).toEqual(custom);
  });
  it.each([defaultLightTokens, defaultDarkTokens])(
    "keeps default text, buttons, current badges and status colors readable",
    (tokens) => {
      for (const foreground of [
        tokens.ink,
        tokens.muted,
        tokens.brand,
        tokens.coral,
        tokens.success,
        tokens.warning,
        tokens.danger
      ]) {
        for (const background of [tokens.canvas, tokens.surface, tokens.elevated]) {
          expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrastRatio(tokens.brand, tokens.brandSoft)).toBeGreaterThanOrEqual(4.5);
    }
  );
});
