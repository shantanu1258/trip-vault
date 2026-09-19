import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  applyPublishedPalette,
  PALETTE_UPDATED_EVENT,
  readCachedPalette
} from "./publishedPalette";

export type ThemePreference = "system" | "light" | "dark";

type ThemeContextValue = {
  preference: ThemePreference;
  resolvedTheme: "light" | "dark";
  setPreference: (preference: ThemePreference) => void;
};

const STORAGE_KEY = "trip-vault:theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readPreference(): ThemePreference {
  const value = localStorage.getItem(STORAGE_KEY);
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const media = useMemo(() => window.matchMedia("(prefers-color-scheme: dark)"), []);
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(media.matches);
  const [palette, setPalette] = useState(readCachedPalette);
  const resolvedTheme = resolveTheme(preference, systemDark);

  useEffect(() => {
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [media]);

  useEffect(() => {
    applyPublishedPalette(palette, resolvedTheme);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", palette[resolvedTheme].canvas);
  }, [palette, resolvedTheme]);

  useEffect(() => {
    const update = () => setPalette(readCachedPalette());
    window.addEventListener(PALETTE_UPDATED_EVENT, update);
    return () => window.removeEventListener(PALETTE_UPDATED_EVENT, update);
  }, []);

  const setPreference = (next: ThemePreference) => {
    localStorage.setItem(STORAGE_KEY, next);
    setPreferenceState(next);
  };

  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
