"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { User } from "@prodapp/shared-types";
import { api, setAuthToken, getAuthToken } from "@/lib/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<User>("/api/auth/me");
      if ("ok" in res && res.ok) setUser(res.data);
      else {
        setAuthToken(null);
      }
    } catch {
      setAuthToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUser();
  }, [loadUser]);

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
    <AuthCtx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}