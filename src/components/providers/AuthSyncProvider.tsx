/**
 * AuthSyncProvider Component
 * Wrapper that synchronizes AuthContext with Zustand store
 * Placed inside AuthProvider but outside route components
 */

import React, { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppStore } from '@/stores';

export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const store = useAppStore();
  
  // Use ref to track previous values and prevent infinite loops
  const prevValuesRef = useRef({
    userId: null as string | null,
    tenantId: null as string | null,
    isAuthenticated: false,
    isLoading: true,
    rolesJson: '[]',
  });

  useEffect(() => {
    const userId = auth.user?.id ?? null;
    const tenantId = auth.tenant?.id ?? null;
    const isAuthenticated = !!auth.user;
    const isLoading = auth.isLoading;
    const rolesJson = JSON.stringify(auth.roles);

    const prevValues = prevValuesRef.current;
    
    // Only update if values actually changed
    if (
      prevValues.userId === userId &&
      prevValues.tenantId === tenantId &&
      prevValues.isAuthenticated === isAuthenticated &&
      prevValues.isLoading === isLoading &&
      prevValues.rolesJson === rolesJson
    ) {
      return; // No changes, skip update
    }

    // Update ref with current values
    prevValuesRef.current = {
      userId,
      tenantId,
      isAuthenticated,
      isLoading,
      rolesJson,
    };

    // Single batch update to prevent render-phase state updates
    store.syncAuth({
      user: auth.user && auth.profile ? {
        id: auth.user.id,
        email: auth.user.email || '',
        firstName: auth.profile.first_name || '',
        lastName: auth.profile.last_name || '',
        avatar: auth.profile.avatar_url || null,
        role: auth.roles[0] || 'STUDENT',
      } : null,
      currentTenant: auth.tenant ? {
        id: auth.tenant.id,
        name: auth.tenant.name,
        slug: auth.tenant.slug,
        logo: auth.tenant.logo_url || null,
      } : null,
      isAuthenticated: !!auth.user,
      isLoading: auth.isLoading,
      permissions: auth.roles.map(role => ({
        id: role,
        name: role,
        description: `Role: ${role}`,
      })),
    });
  }, [auth.user?.id, auth.profile?.id, auth.tenant?.id, auth.isLoading, auth.roles.length, store]);

  return <>{children}</>;
}
