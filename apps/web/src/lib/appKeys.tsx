"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

interface AppKeysState {
  paletteOpen: boolean;
  openPalette: () => void;
  setPaletteOpen: (v: boolean) => void;
}

const AppKeysCtx = createContext<AppKeysState | null>(null);

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    el.getAttribute("role") === "textbox"
  );
}

/** Global keyboard shortcuts. Mount once (inside AppShell). */
export function GlobalKeys() {
  const { paletteOpen, setPaletteOpen } = useAppKeys();
  const router = useRouter();
  const pathname = usePathname();

  const navigate = useCallback(
    (href: string) => {
      if (pathname !== href.split("?")[0]) router.push(href);
    },
    [pathname, router],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
        return;
      }

      if (paletteOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          setPaletteOpen(false);
        }
        return;
      }

      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          navigate("/tasks?new=1");
          break;
        case "t":
          e.preventDefault();
          navigate("/tasks");
          break;
        case "c":
          e.preventDefault();
          navigate("/calendar");
          break;
        case "a":
          e.preventDefault();
          navigate("/attendance");
          break;
        case "z":
          e.preventDefault();
          navigate("/zen");
          break;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [paletteOpen, setPaletteOpen, navigate]);

  return null;
}

export function AppKeysProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const value = useMemo<AppKeysState>(
    () => ({
      paletteOpen,
      openPalette: () => setPaletteOpen(true),
      setPaletteOpen,
    }),
    [paletteOpen],
  );

  return <AppKeysCtx.Provider value={value}>{children}</AppKeysCtx.Provider>;
}

export function useAppKeys() {
  const ctx = useContext(AppKeysCtx);
  if (!ctx)
    throw new Error("useAppKeys must be used within AppKeysProvider");
  return ctx;
}