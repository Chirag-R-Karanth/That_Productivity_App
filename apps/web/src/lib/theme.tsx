"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Theme = "dark" | "light";

const THEME_KEY = "theme";
const MOTION_KEY = "reduce-motion";

export function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(theme);
}

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
}

const ThemeCtx = createContext<ThemeState | null>(null);

function storedTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "light" || t === "dark") return t;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function storedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MOTION_KEY) === "1";
  } catch {
    return false;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(storedTheme);
  const [reduceMotion, setReduceMotionState] = useState<boolean>(storedMotion);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("reduce-motion", reduceMotion);
  }, [reduceMotion]);

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      setTheme: (t) => {
        setThemeState(t);
        try {
          localStorage.setItem(THEME_KEY, t);
        } catch {
          /* private mode */
        }
      },
      reduceMotion,
      setReduceMotion: (v) => {
        setReduceMotionState(v);
        try {
          if (v) localStorage.setItem(MOTION_KEY, "1");
          else localStorage.removeItem(MOTION_KEY);
        } catch {
          /* private mode */
        }
      },
    }),
    [theme, reduceMotion],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}