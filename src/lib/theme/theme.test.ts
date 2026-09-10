import { describe, expect, it } from "vitest";
import { defaultDarkTokens, defaultLightTokens } from "../../features/admin/api";
import { resolveTheme } from "./ThemeProvider";
import { readCachedPalette } from "./publishedPalette";

describe("device theme", () => {
  it("resolves System, Light, and Dark deterministically", () => { expect(resolveTheme("system", true)).toBe("dark"); expect(resolveTheme("system", false)).toBe("light"); expect(resolveTheme("light", true)).toBe("light"); expect(resolveTheme("dark", false)).toBe("dark"); });
  it("falls back to bundled tokens when cached configuration is invalid", () => { localStorage.setItem("trip-vault:published-palette", JSON.stringify({ version: 7, light: { ink: "javascript:" }, dark: {} })); expect(readCachedPalette()).toEqual({ version: 0, light: defaultLightTokens, dark: defaultDarkTokens }); });
  it("reads a complete accessible cached release atomically", () => { localStorage.setItem("trip-vault:published-palette", JSON.stringify({ version: 3, light: defaultLightTokens, dark: defaultDarkTokens })); expect(readCachedPalette().version).toBe(3); });
});
