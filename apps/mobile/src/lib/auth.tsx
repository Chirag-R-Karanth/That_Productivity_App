import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import type { User } from "@prodapp/shared-types";
import { api, setAuthToken } from "./api";

const TOKEN_KEY = "prodapp.token";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const token = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
      if (token) {
        setAuthToken(token);
        try {
          const me = await api.get<User>("/api/auth/me");
          setUser(me);
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
          setAuthToken(null);
        }
      }
      setLoading(false);
    };
    void bootstrap();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>("/api/auth/login", { email, password });
    setAuthToken(data.token);
    await SecureStore.setItemAsync(TOKEN_KEY, data.token).catch(() => null);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>("/api/auth/register", {
      name,
      email,
      password,
    });
    setAuthToken(data.token);
    await SecureStore.setItemAsync(TOKEN_KEY, data.token).catch(() => null);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    setAuthToken(null);
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}