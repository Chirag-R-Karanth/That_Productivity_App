"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Reveal } from "@/components/Reveal";
import { useServiceWorker } from "@/hooks/useServiceWorker";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading, login, register } = useAuth();
  useServiceWorker();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-text-muted">
        Loading…
      </div>
    );
  }

  if (!user) {
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSubmitting(true);
      try {
        if (mode === "login") await login(email, password);
        else await register(email, password);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed");
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Reveal>
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-surface p-8"
          >
            <h1 className="text-xl font-semibold tracking-tight">
              {mode === "login" ? "Sign in" : "Create account"}
            </h1>
            {error && (
              <p className="text-sm text-danger">{error}</p>
            )}
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-text placeholder-text-muted outline-none focus:border-accent"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm text-text placeholder-text-muted outline-none focus:border-accent"
            />
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-accent py-3 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "…" : mode === "login" ? "Sign in" : "Register"}
            </button>
            <p className="text-center text-xs text-text-muted">
              {mode === "login" ? "No account?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "login" ? "register" : "login");
                  setError(null);
                }}
                className="text-accent hover:underline"
              >
                {mode === "login" ? "Register" : "Sign in"}
              </button>
            </p>
          </form>
        </Reveal>
      </div>
    );
  }

  return <>{children}</>;
}