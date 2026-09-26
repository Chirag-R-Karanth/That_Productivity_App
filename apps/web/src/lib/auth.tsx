"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { User } from "@prodapp/shared-types";
import { api, setAuthToken, getAuthToken, subscribeAuthToken } from "@/lib/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

const noToken = () => null;

export function AuthProvider({ children }: { children: ReactNode }) {
  // The token is the real source of truth for "is anyone signed in", so it is
  // read as a store rather than pushed into state from an effect. A signed-out
  // visitor is therefore never shown a loading state, and a token that appears
  // or disappears (login, logout, another tab) re-renders on its own.
  const token = useSyncExternalStore(subscribeAuthToken, getAuthToken, noToken);
  const [user, setUser] = useState<User | null>(null);
  /** The token whose `/api/auth/me` lookup has finished, successfully or not. */
  const [resolvedFor, setResolvedFor] = useState<string | null>(null);
  /**
   * Whether the client has taken over from the server-rendered markup.
   *
   * The server cannot see localStorage, so it always renders the signed-out
   * shape. Without this flag a returning user would be shown the sign-in form
   * for one commit while the store re-reads the token. Holding the loading
   * state until after hydration keeps that flash out; a genuinely signed-out
   * visitor still costs only this one tick.
   */
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const run = async () => {
      try {
        const res = await api.get<User>("/api/auth/me");
        if (cancelled) return;
        if ("ok" in res && res.ok) setUser(res.data);
        else setAuthToken(null);
      } catch {
        setAuthToken(null);
      } finally {
        if (!cancelled) setResolvedFor(token);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Nothing is known until hydration, and a token we have not resolved yet means
  // we do not know who this is, so either way the caller should wait.
  const loading = !hydrated || (token !== null && resolvedFor !== token);
  const currentUser = token === null ? null : user;

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>(
      "/api/auth/login",
      { email, password },
    );
    if ("ok" in res && res.ok) {
      setAuthToken(res.data.token);
      setUser(res.data.user);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: User }>(
      "/api/auth/register",
      { email, password },
    );
    if ("ok" in res && res.ok) {
      setAuthToken(res.data.token);
      setUser(res.data.user);
    }
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user: currentUser, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}