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
    // Sync user
    if (auth.user && auth.profile) {
      store.setUser({
        id: auth.user.id,
        email: auth.user.email || '',
        firstName: auth.profile.first_name || '',
        lastName: auth.profile.last_name || '',
        avatar: auth.profile.avatar_url || null,
        role: auth.roles[0] || 'STUDENT',
      });
    } else {
      store.setUser(null);
    }

    // Sync tenant
    if (auth.tenant) {
      store.setCurrentTenant({
        id: auth.tenant.id,
        name: auth.tenant.name,
        slug: auth.tenant.slug,
        logo: auth.tenant.logo_url || null,
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
