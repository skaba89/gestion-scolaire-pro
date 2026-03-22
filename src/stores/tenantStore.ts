/**
 * Tenant Store (Zustand)
 * Global state management for tenant context and settings
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TenantSettings {
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  language?: string;
  timezone?: string;
  [key: string]: string | undefined;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  type: "SCHOOL" | "UNIVERSITY" | "TRAINING_CENTER";
  is_active: boolean;
  settings?: TenantSettings;
  created_at: string;
  updated_at: string;
}

export interface TenantStore {
  currentTenant: Tenant | null;
  tenants: Tenant[];
  isLoading: boolean;
  error?: string;
  lastUpdated?: number;

  setCurrentTenant: (tenant: Tenant | null) => void;
  setTenants: (tenants: Tenant[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error?: string) => void;
  addTenant: (tenant: Tenant) => void;
  updateTenant: (tenantId: string, updates: Partial<Tenant>) => void;
  removeTenant: (tenantId: string) => void;
  updateSettings: (tenantId: string, settings: TenantSettings) => void;
  getSetting: (key: string) => string | undefined;
  switchTenant: (tenantId: string) => boolean;
  getTenantBySlug: (slug: string) => Tenant | undefined;
}

const TENANT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const useTenantStore = create<TenantStore>()(
  persist(
    (set, get) => ({
      currentTenant: null,
      tenants: [],
      isLoading: false,
      error: undefined,
      lastUpdated: undefined,

      setCurrentTenant: (tenant) => {
        set({
          currentTenant: tenant,
          lastUpdated: Date.now(),
          error: undefined,
        });
      },

      setTenants: (tenants) => {
        set({ tenants, lastUpdated: Date.now() });
      },

      setIsLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),

      addTenant: (tenant) => {
        const tenants = get().tenants;
        if (!tenants.find((t) => t.id === tenant.id)) {
          set({ tenants: [...tenants, tenant] });
        }
      },

      updateTenant: (tenantId, updates) => {
        const tenants = get().tenants.map((t) =>
          t.id === tenantId ? { ...t, ...updates } : t
        );
        set({ tenants });

        const currentTenant = get().currentTenant;
        if (currentTenant?.id === tenantId) {
          set({
            currentTenant: { ...currentTenant, ...updates },
            lastUpdated: Date.now(),
          });
        }
      },

      removeTenant: (tenantId) => {
        const tenants = get().tenants.filter((t) => t.id !== tenantId);
        set({ tenants });

        const currentTenant = get().currentTenant;
        if (currentTenant?.id === tenantId) {
          set({
            currentTenant: tenants[0] || null,
            lastUpdated: Date.now(),
          });
        }
      },

      updateSettings: (tenantId, settings) => {
        const tenants = get().tenants.map((t) =>
          t.id === tenantId
            ? {
                ...t,
                settings: { ...t.settings, ...settings },
              }
            : t
        );
        set({ tenants });

        const currentTenant = get().currentTenant;
        if (currentTenant?.id === tenantId) {
          set({
            currentTenant: {
              ...currentTenant,
              settings: { ...currentTenant.settings, ...settings },
            },
            lastUpdated: Date.now(),
          });
        }
      },

      getSetting: (key) => {
        const currentTenant = get().currentTenant;
        return currentTenant?.settings?.[key];
      },

      switchTenant: (tenantId) => {
        const tenant = get().tenants.find((t) => t.id === tenantId);
        if (tenant) {
          set({
            currentTenant: tenant,
            lastUpdated: Date.now(),
            error: undefined,
          });
          return true;
        }
        return false;
      },

      getTenantBySlug: (slug) => {
        return get().tenants.find((t) => t.slug === slug);
      },
    }),
    {
      name: "tenant-store",
      partialize: (state) => ({
        currentTenant: state.currentTenant,
        tenants: state.tenants,
      }),
    }
  )
);

// Compute if tenant data is stale
export const isTenantStale = (): boolean => {
  const state = useTenantStore.getState();
  if (!state.lastUpdated) return true;
  return Date.now() - state.lastUpdated > TENANT_CACHE_TTL;
};
