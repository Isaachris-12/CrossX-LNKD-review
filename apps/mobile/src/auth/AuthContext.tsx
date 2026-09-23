import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AuthResponse, AuthUser } from "@crossx/shared";
import { apiFetch, publicFetch } from "../api/client";
import * as tokenStore from "./tokenStore";
import { ensurePurchasesConfigured } from "../subscription/revenuecat";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  // Re-fetches /auth/me - used after a purchase completes to pick up the
  // subscription state once RevenueCat's webhook has updated the backend.
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On launch, try to restore a session from a persisted refresh token.
  useEffect(() => {
    (async () => {
      const tokens = await tokenStore.loadPersistedTokens();
      if (tokens.accessToken) {
        try {
          const me = await apiFetch<AuthUser>("/auth/me");
          setUser(me);
          ensurePurchasesConfigured(me.id);
        } catch {
          await tokenStore.clearTokens();
        }
      }
      setIsLoading(false);
    })();
  }, []);

  async function applyAuthResponse(data: AuthResponse) {
    await tokenStore.setTokens(data.tokens);
    setUser(data.user);
    ensurePurchasesConfigured(data.user.id);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      async signUp(email, password) {
        const data = await publicFetch<AuthResponse>("/auth/signup", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        await applyAuthResponse(data);
      },
      async signIn(email, password) {
        const data = await publicFetch<AuthResponse>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        await applyAuthResponse(data);
      },
      async signOut() {
        const refreshToken = tokenStore.getRefreshToken();
        await tokenStore.clearTokens();
        setUser(null);
        if (refreshToken) {
          // Best-effort server-side revocation; local session is already cleared either way.
          publicFetch("/auth/logout", {
            method: "POST",
            body: JSON.stringify({ refreshToken }),
          }).catch(() => {});
        }
      },
      async refreshUser() {
        const me = await apiFetch<AuthUser>("/auth/me");
        setUser(me);
      },
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
