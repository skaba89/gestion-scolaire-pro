/**
 * Auth Store (Zustand)
 * Global state management for authentication tokens and JWT
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session } from "@supabase/supabase-js";

export interface AuthToken {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface JWTPayload {
  sub: string; // user_id
  aud?: string;
  tenant_id?: string;
  roles?: string[];
  iat?: number;
  exp?: number;
  email?: string;
}

export interface AuthStore {
  session: Session | null;
  authToken: AuthToken | null;
  jwtPayload: JWTPayload | null;
  isInitialized: boolean;
  isLoading: boolean;
  error?: string;

  setSession: (session: Session | null) => void;
  setAuthToken: (token: AuthToken | null) => void;
  setJWTPayload: (payload: JWTPayload | null) => void;
  setIsInitialized: (initialized: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error?: string) => void;
  clearAuth: () => void;
  isTokenExpired: () => boolean;
  getTokenExpiryTime: () => number | null;
  getTenantIdFromToken: () => string | null;
  getUserIdFromToken: () => string | null;
}

const decodeJWT = (token: string): JWTPayload | null => {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const decoded = JSON.parse(atob(parts[1]));
    return decoded as JWTPayload;
  } catch {
    return null;
  }
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      session: null,
      authToken: null,
      jwtPayload: null,
      isInitialized: false,
      isLoading: true,
      error: undefined,

      setSession: (session) => {
        set({ session });
        if (session?.access_token) {
          const jwtPayload = decodeJWT(session.access_token);
          set({ jwtPayload });
        }
      },

      setAuthToken: (token) => {
        set({ authToken: token, error: undefined });
        if (token?.access_token) {
          const jwtPayload = decodeJWT(token.access_token);
          set({ jwtPayload });
        }
      },

      setJWTPayload: (payload) => set({ jwtPayload: payload }),

      setIsInitialized: (initialized) => set({ isInitialized: initialized }),

      setIsLoading: (loading) => set({ isLoading: loading }),

      setError: (error) => set({ error }),

      clearAuth: () => {
        set({
          session: null,
          authToken: null,
          jwtPayload: null,
          error: undefined,
        });
      },

      isTokenExpired: () => {
        const jwtPayload = get().jwtPayload;
        if (!jwtPayload?.exp) return true;

        const expiryTime = jwtPayload.exp * 1000; // Convert to milliseconds
        return Date.now() > expiryTime;
      },

      getTokenExpiryTime: () => {
        const jwtPayload = get().jwtPayload;
        return jwtPayload?.exp ? jwtPayload.exp * 1000 : null;
      },

      getTenantIdFromToken: () => {
        return get().jwtPayload?.tenant_id || null;
      },

      getUserIdFromToken: () => {
        return get().jwtPayload?.sub || null;
      },
    }),
    {
      name: "auth-store",
      partialize: (state) => ({
        session: state.session,
        authToken: state.authToken,
        jwtPayload: state.jwtPayload,
        isInitialized: state.isInitialized,
      }),
    }
  )
);
