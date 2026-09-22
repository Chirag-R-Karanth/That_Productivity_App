"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CloseIcon, LogoIcon, ArrowRightIcon } from "@/components/icons";

interface Me {
  email: string;
  name: string;
  onboardingComplete: boolean;
}

const SKIP_KEY = "prodapp:onboarding-skipped";

function skippedFor(email: string): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === email;
  } catch {
    return false;
  }
}

function markSkipped(email: string) {
  try {
    localStorage.setItem(SKIP_KEY, email);
  } catch {
    /* private mode */
  }
}

/** Lightweight first-run card: capture the display name. */
export function Onboarding() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancel = false;
    void api.get<Me>("/api/auth/me").then((res) => {
      if (cancel || !("ok" in res) || !res.ok) return;
      const m = res.data;
      if (m.onboardingComplete || skippedFor(m.email)) {
        return;
      }
      setMe(m);
      setName(m.name ?? "");
    });
    return () => {
      cancel = true;
    };
  }, []);

  if (!me || dismissed) return null;

  const finish = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { onboardingComplete: true };
      const trimmed = name.trim();
      if (trimmed) body.name = trimmed;
      const res = await api.patch<{ email: string }>("/api/auth/me", body);
      if ("ok" in res && res.ok) {
        markSkipped(res.data.email);
        setDismissed(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    markSkipped(me.email);
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-14 right-4 z-40 w-full max-w-sm md:bottom-16 md:right-6">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <LogoIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-text">Welcome to That Productivity App</h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Plan, focus, and understand. What should we call you?
            </p>
          </div>
          <button
            type="button"
            onClick={skip}
            aria-label="Dismiss"
            className="shrink-0 rounded p-1 text-text-muted hover:bg-surface-elevated hover:text-text"
          >
            <CloseIcon className="h-3.5 w-3.5" />
          </button>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="mt-4 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => void finish()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {saving ? "…" : "Finish setup"}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}