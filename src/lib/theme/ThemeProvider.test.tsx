import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ThemeProvider } from "./ThemeProvider";
import { ThemeToggle } from "../../components/ThemeToggle";
import { defaultDarkTokens, defaultLightTokens } from "../../features/admin/api";
import { PALETTE_KEY } from "./publishedPalette";
import styles from "../../styles/globals.css?raw";

afterEach(() => {
  localStorage.removeItem("trip-vault:theme");
  localStorage.removeItem(PALETTE_KEY);
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
});

it("switches the trip hero's inherited palette with the visible theme toggle", async () => {
  localStorage.setItem("trip-vault:theme", "light");
  localStorage.removeItem(PALETTE_KEY);
  render(
    <ThemeProvider>
      <ThemeToggle />
      <header className="trip-hero">Trip</header>
    </ThemeProvider>
  );
  const channels = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");
  expect(document.documentElement.dataset.theme).toBe("light");
  expect(document.documentElement.style.getPropertyValue("--color-brand")).toBe(
    channels(defaultLightTokens.brand)
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Theme: light. Currently light. Change to dark." })
  );
  expect(document.documentElement.dataset.theme).toBe("dark");
  expect(document.documentElement.style.colorScheme).toBe("dark");
  expect(document.documentElement.style.getPropertyValue("--color-brand-soft")).toBe(
    channels(defaultDarkTokens.brandSoft)
  );
  expect(document.documentElement.style.getPropertyValue("--color-ink")).toBe(
    channels(defaultDarkTokens.ink)
  );
  expect(styles).toMatch(
    /\[data-theme="dark"\] \.trip-hero\s*\{\s*--color-brand: var\(--color-brand-soft\);\s*--color-surface: var\(--color-ink\);/
  );
});
