import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "../lib/theme/ThemeProvider";

const sequence: ThemePreference[] = ["system", "light", "dark"];

export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const Icon = preference === "system" ? Laptop : preference === "dark" ? Moon : Sun;
  const next = sequence[(sequence.indexOf(preference) + 1) % sequence.length];

  return (
    <button
      type="button"
      onClick={() => setPreference(next)}
      className="tap-target inline-flex items-center justify-center gap-2 rounded-full border border-line bg-surface px-3 text-sm font-semibold text-ink shadow-sm hover:bg-elevated"
      aria-label={`Theme: ${preference}. Currently ${resolvedTheme}. Change to ${next}.`}
      title={`Theme: ${preference}`}
    >
      <Icon className="size-4" aria-hidden="true" />
      {showLabel && <span className="capitalize">{preference}</span>}
    </button>
  );
}
