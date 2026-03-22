/**
 * User Store (Zustand)
 * Global state management for user authentication and profile
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AppRole } from "@/lib/types";

export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  phone?: string;
  tenant_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserSession {
  user: UserProfile | null;
  roles: AppRole[];
  isAuthenticated: boolean;
  isLoading: boolean;
  error?: string;
}

export interface UserStore extends UserSession {
  setUser: (user: UserProfile | null) => void;
  setRoles: (roles: AppRole[]) => void;
  setIsAuthenticated: (isAuthenticated: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error?: string) => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  logout: () => void;
  hasRole: (role: AppRole) => boolean;
  isAdmin: () => boolean;
  getFullName: () => string;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      user: null,
      roles: [],
      isAuthenticated: false,
      isLoading: true,
      error: undefined,

      setUser: (user) => set({ user }),
      setRoles: (roles) => set({ roles }),
      setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      updateProfile: (profile) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: {
              ...currentUser,
              ...profile,
              updated_at: new Date().toISOString(),
            },
          });
        }
      },

      logout: () => {
        set({
          user: null,
          roles: [],
          isAuthenticated: false,
          error: undefined,
        });
      },

      hasRole: (role: AppRole) => {
        return get().roles.includes(role);
      },

      isAdmin: () => {
        const roles = get().roles;
        return roles.includes("SUPER_ADMIN") || roles.includes("TENANT_ADMIN");
      },

      getFullName: () => {
        const user = get().user;
        if (!user) return "";
        return `${user.first_name} ${user.last_name}`.trim();
      },
    }),
    {
      name: "user-store",
      partialize: (state) => ({
        user: state.user,
        roles: state.roles,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
