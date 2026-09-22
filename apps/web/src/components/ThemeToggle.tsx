"use client";

import { useTheme, type Theme } from "@/lib/theme";
import { SunIcon, MoonIcon } from "@/components/icons";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-muted transition-colors hover:border-border hover:text-text ${className ?? ""}`}
    >
      {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
      <span className="capitalize">{theme}</span>
    </button>
  );
}