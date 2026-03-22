/**
 * Store Synchronization Middleware
 * Keeps Zustand stores in sync with existing React Context providers
 */

import { useEffect } from "react";
import { useAuth as useAuthContext } from "@/contexts/AuthContext";
import { useTenant as useTenantContext } from "@/contexts/TenantContext";
import { useUserStore } from "@/stores/userStore";
import { useTenantStore } from "@/stores/tenantStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * Hook to synchronize AuthContext with Zustand stores
 */
export const useSyncAuthStores = () => {
  const authContext = useAuthContext();
  const userStore = useUserStore();
  const authStore = useAuthStore();

  useEffect(() => {
    if (!authContext) return;

    // Sync user to user store
    if (authContext.profile) {
      userStore.setUser({
        id: authContext.profile.id,
        email: authContext.profile.email,
        first_name: authContext.profile.first_name || "",
        last_name: authContext.profile.last_name || "",
        avatar_url: authContext.profile.avatar_url,
        phone: authContext.profile.phone,
        tenant_id: authContext.profile.tenant_id,
        is_active: authContext.profile.is_active,
        created_at: authContext.profile.created_at,
        updated_at: authContext.profile.updated_at,
      });
    }

    // Sync roles to user store
    if (authContext.userRoles) {
      userStore.setRoles(authContext.userRoles);
    }

    // Sync authentication status
    userStore.setIsAuthenticated(authContext.isAuthenticated);
    userStore.setIsLoading(authContext.isLoading);
    userStore.setError(authContext.error);

    // Sync session to auth store
    if (authContext.session) {
      authStore.setSession(authContext.session);
    }
  }, [authContext, userStore, authStore]);
};

/**
 * Hook to synchronize TenantContext with Zustand stores
 */
export const useSyncTenantStores = () => {
  const tenantContext = useTenantContext();
  const tenantStore = useTenantStore();

  useEffect(() => {
    if (!tenantContext) return;

    // Sync current tenant
    if (tenantContext.currentTenant) {
      tenantStore.setCurrentTenant({
        id: tenantContext.currentTenant.id,
        name: tenantContext.currentTenant.name,
        slug: tenantContext.currentTenant.slug,
        logo_url: tenantContext.currentTenant.logo_url,
        address: tenantContext.currentTenant.address,
        phone: tenantContext.currentTenant.phone,
        email: tenantContext.currentTenant.email,
        website: tenantContext.currentTenant.website,
        type: tenantContext.currentTenant.type,
        is_active: tenantContext.currentTenant.is_active,
        settings: tenantContext.currentTenant.settings,
        created_at: tenantContext.currentTenant.created_at,
        updated_at: tenantContext.currentTenant.updated_at,
      });
    }

    tenantStore.setIsLoading(tenantContext.isLoading);
    tenantStore.setError(tenantContext.error);
  }, [tenantContext, tenantStore]);
};

/**
 * Component that sets up store synchronization
 */
export function StoreSyncProvider({ children }: { children: React.ReactNode }) {
  useSyncAuthStores();
  useSyncTenantStores();

  return <>{children}</>;
}
