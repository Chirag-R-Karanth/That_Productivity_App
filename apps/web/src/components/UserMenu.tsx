"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";

export function UserMenu({ className }: { className?: string }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  if (!user) return null;

  const initial = (user.name || user.email).charAt(0).toUpperCase();

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-label="Account menu"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-60 overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
          <div className="px-4 py-3">
            <p className="truncate text-sm font-medium text-text">{user.name || "That Productivity App"}</p>
            <p className="truncate text-xs text-text-muted">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="block w-full border-t border-border px-4 py-2.5 text-left text-sm text-danger transition-colors hover:bg-surface-elevated"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}