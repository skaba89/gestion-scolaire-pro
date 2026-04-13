/**
 * useAuthSync Hook
 * Synchronizes AuthContext with Zustand store
 * Bridges Context API and store for seamless integration
 */

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppStore } from '@/stores';

export function useAuthSync() {
  const auth = useAuth();
  const store = useAppStore();

  useEffect(() => {
    // Sync user — map to Zustand store User interface (first_name, last_name, avatar_url)
    if (auth.user && auth.profile) {
      store.setUser({
        id: auth.user.id,
        email: auth.user.email || '',
        first_name: auth.profile.first_name || '',
        last_name: auth.profile.last_name || '',
        avatar_url: auth.profile.avatar_url || undefined,
        is_active: true,
        created_at: auth.profile.created_at,
      });
    } else {
      store.setUser(null);
    }

    // Sync tenant — map to Zustand store Tenant interface (logo_url, not logo)
    if (auth.tenant) {
      store.setCurrentTenant({
        id: auth.tenant.id,
        name: auth.tenant.name,
        slug: auth.tenant.slug,
        logo_url: auth.tenant.logo_url || undefined,
      });
    } else {
      store.setCurrentTenant(null);
    }

    // Sync auth state
    store.setIsAuthenticated(!!auth.user);

    // Sync loading state
    store.setIsLoading(auth.isLoading);

    // Sync roles/permissions
    store.setPermissions(
      auth.roles.map(role => ({
        id: role,
        name: role,
        description: `Role: ${role}`,
      }))
    );
  }, [auth.user, auth.profile, auth.tenant, auth.roles, auth.isLoading, store]);

  // Return auth context for use in components that need RLS
  return auth;
}

/**
 * Alternative: Simple context passthrough
 * Use this in components that need to use Zustand
 * but also need AuthContext for RLS enforcement
 */
export function useAuthWithStore() {
  const auth = useAuth();
  const store = useAppStore();

  return {
    // Auth context (for RLS, sensitive operations)
    auth,
    
    // Zustand store (for UI state, notifications)
    store,

    // Combined helpers
    isAuthenticated: auth.user !== null,
    user: auth.profile,
    currentTenant: store.currentTenant,
    hasRole: (role: string) => auth.hasRole(role as any),
    isAdmin: () => auth.isAdmin(),
  };
}
