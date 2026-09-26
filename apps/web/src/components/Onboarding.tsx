"use client";

import { useCallback, useEffect, useState } from "react";
import { api, getAuthToken, API_BASE } from "@/lib/api";
import { CloseIcon, LogoIcon, ArrowRightIcon, GoogleIcon, CalendarIcon, CheckIcon } from "@/components/icons";

interface Me {
  email: string;
  name: string;
  onboardingComplete: boolean;
}

const SKIP_KEY = "prodapp:onboarding-skipped";

type Step = "name" | "google";

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

/**
 * First-run card. Two questions, in the order they can actually be answered:
 * what to call you, then whether to pull in Google.
 *
 * The Google step is only offered when it is both possible and wanted. A
 * deployment without OAuth credentials configured cannot offer it, and an
 * account that is already linked has nothing left to answer, so in both cases
 * the card goes straight from the name to done instead of asking a question
 * whose answer is already known.
 */
export function Onboarding() {
  const [me, setMe] = useState<Me | null>(null);
  const [name, setName] = useState("");
  const [step, setStep] = useState<Step>("name");
  const [offerGoogle, setOfferGoogle] = useState(false);
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

  // Decided separately from the name step: the card should not appear and then
  // change its mind about how many questions it has.
  useEffect(() => {
    if (!me) return;
    let cancel = false;
    void (async () => {
      const [status, connections] = await Promise.all([
        api.get<{ configured: boolean }>("/api/auth/google/status"),
        api.get<unknown[]>("/api/auth/google/connections"),
      ]);
      if (cancel) return;
      const configured = "ok" in status && status.ok && status.data.configured;
      const linked = "ok" in connections && connections.ok && connections.data.length > 0;
      setOfferGoogle(configured && !linked);
    })();
    return () => {
      cancel = true;
    };
  }, [me]);

  /** Close onboarding. The Google choice is saved before this if one was made. */
  const complete = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await api.patch<{ email: string }>("/api/auth/me", body);
      if ("ok" in res && res.ok) {
        markSkipped(res.data.email);
        setDismissed(true);
      }
    },
    [],
  );

  const finishWithName = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      const trimmed = name.trim();
      if (trimmed) body.name = trimmed;
      // Saved on the way past the name step as well, so a reload between the two
      // questions does not lose what was typed.
      if (!offerGoogle) body.onboardingComplete = true;
      await complete(body);
      if (offerGoogle) setStep("google");
    } finally {
      setSaving(false);
    }
  };

  const connectGoogle = async () => {
    setSaving(true);
    try {
      // Marked complete first: Google sends the browser to its own consent
      // screen and back, and the card must not greet the user with the same
      // question a second time on the way back.
      const body: Record<string, unknown> = { onboardingComplete: true };
      const trimmed = name.trim();
      if (trimmed) body.name = trimmed;
      const done = await api.patch<{ email: string }>("/api/auth/me", body);
      if (!("ok" in done && done.ok)) return;
      markSkipped(done.data.email);

      // Resolved against the current origin so the destination is always
      // absolute: API_BASE is empty in the same-origin Docker deployment and a
      // full URL when the API is hosted separately, and `location.assign` wants
      // one or the other, not an ambiguous "/api/..." string.
      const url = new URL(`${API_BASE}/api/auth/google`, window.location.origin);
      url.searchParams.set("token", getAuthToken() ?? "");
      window.location.assign(url.toString());
    } finally {
      setSaving(false);
    }
  };

  const skip = () => {
    if (me) markSkipped(me.email);
    setDismissed(true);
  };

  if (!me || dismissed) return null;

  return (
    <div className="fixed bottom-14 right-4 z-40 w-full max-w-sm md:bottom-16 md:right-6">
      <div className="rounded-2xl border border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <LogoIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-text">
              {step === "name" ? "Welcome to That Productivity App" : "Bring in your Google"}
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              {step === "name"
                ? "Plan, focus, and understand. What should we call you?"
                : "Optional. It fills the day view and the task list instead of you retyping them."}
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

        {step === "name" ? (
          <div className="onboarding-step">
            <label htmlFor="onboarding-name" className="sr-only">
              Your name
            </label>
            <input
              id="onboarding-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !saving) void finishWithName();
              }}
              placeholder="Your name"
              className="mt-4 w-full rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={skip}
                className="rounded px-1 py-2 text-xs text-text-muted transition-colors hover:text-text"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => void finishWithName()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "…" : offerGoogle ? "Next" : "Finish setup"}
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="onboarding-step">
            <ul className="mt-4 space-y-2">
              <li className="flex items-start gap-2.5 text-xs text-text-muted">
                <CalendarIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  <span className="text-text">Calendars</span> are read-only. Every linked account
                  contributes to the day view, and the same class appearing in two of them is shown
                  once.
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-xs text-text-muted">
                <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  <span className="text-text">Tasks</span> go both ways. Complete something here and
                  it is complete in Google too.
                </span>
              </li>
              <li className="flex items-start gap-2.5 text-xs text-text-muted">
                <GoogleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
                <span>
                  Link as many accounts as you use. Nothing leaves your browser except to Google,
                  and it is all undone from Settings.
                </span>
              </li>
            </ul>

            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={skip}
                className="rounded px-1 py-2 text-xs text-text-muted transition-colors hover:text-text"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => void connectGoogle()}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {saving ? "…" : "Connect Google"}
                <ArrowRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
