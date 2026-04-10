/**
 * AuthSyncProvider Component
 * Wrapper that synchronizes AuthContext with Zustand store
 * Placed inside AuthProvider but outside route components
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppStore } from '@/stores';

export function AuthSyncProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const store = useAppStore();

  const rolesJson = useMemo(() => JSON.stringify(auth.roles), [auth.roles]);
  const permissionTenantId = auth.tenant?.id ?? 'global';
  const permissionUserId = auth.user?.id ?? 'anonymous';

  const prevValuesRef = useRef({
    userId: null as string | null,
    tenantId: null as string | null,
    isAuthenticated: false,
    isLoading: true,
    rolesJson: '[]',
    profileId: null as string | null,
  });

  useEffect(() => {
    const userId = auth.user?.id ?? null;
    const tenantId = auth.tenant?.id ?? null;
    const isAuthenticated = !!auth.user;
    const isLoading = auth.isLoading;
    const profileId = auth.profile?.id ?? null;

    const prevValues = prevValuesRef.current;

    if (
      prevValues.userId === userId &&
      prevValues.tenantId === tenantId &&
      prevValues.isAuthenticated === isAuthenticated &&
      prevValues.isLoading === isLoading &&
      prevValues.rolesJson === rolesJson &&
      prevValues.profileId === profileId
    ) {
      return;
    }

    prevValuesRef.current = {
      userId,
      tenantId,
      isAuthenticated,
      isLoading,
      rolesJson,
      profileId,
    };

    store.syncAuth({
      user: auth.user && auth.profile
        ? {
            id: auth.user.id,
            email: auth.user.email || '',
            first_name: auth.profile.first_name || '',
            last_name: auth.profile.last_name || '',
            avatar_url: auth.profile.avatar_url || undefined,
            is_active: true,
            created_at: auth.profile.created_at,
          }
        : null,
      currentTenant: auth.tenant
        ? {
            id: auth.tenant.id,
            name: auth.tenant.name,
            slug: auth.tenant.slug,
            logo_url: auth.tenant.logo_url || undefined,
            address: auth.tenant.address,
            phone: auth.tenant.phone,
            email: auth.tenant.email,
            website: auth.tenant.website,
            type: auth.tenant.type,
            is_active: auth.tenant.is_active,
            settings: auth.tenant.settings,
            created_at: auth.tenant.created_at,
          }
        : null,
      isAuthenticated,
      isLoading,
      permissions: auth.roles.map((role) => ({
        id: `${permissionTenantId}:${permissionUserId}:${role}`,
        tenant_id: permissionTenantId,
        user_id: permissionUserId,
        role,
      })),
    });
  }, [
    auth.user,
    auth.profile,
    auth.tenant,
    auth.isLoading,
    rolesJson,
    permissionTenantId,
    permissionUserId,
    store,
  ]);

  return <>{children}</>;
}
