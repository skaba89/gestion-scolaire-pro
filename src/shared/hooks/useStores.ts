/**
 * Custom Hooks for Zustand Store Integration
 */

import { useUserStore } from "@/stores/userStore";
import { useTenantStore, isTenantStale } from "@/stores/tenantStore";
import { useNotificationStore, useNotify } from "@/stores/notificationStore";
import { useAuthStore } from "@/stores/authStore";

/**
 * Hook to use user store with convenience methods
 */
export const useUser = () => {
  const store = useUserStore();

  return {
    user: store.user,
    roles: store.roles,
    fullName: store.getFullName(),
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    error: store.error,
    hasRole: store.hasRole,
    isAdmin: store.isAdmin,
    setUser: store.setUser,
    logout: store.logout,
  };
};

/**
 * Hook to use tenant store with convenience methods
 */
export const useTenant = () => {
  const store = useTenantStore();

  return {
    currentTenant: store.currentTenant,
    tenants: store.tenants,
    isLoading: store.isLoading,
    error: store.error,
    isStale: isTenantStale(),
    switchTenant: store.switchTenant,
    updateSettings: store.updateSettings,
    getSetting: store.getSetting,
    getTenantBySlug: store.getTenantBySlug,
    setCurrentTenant: store.setCurrentTenant,
  };
};

/**
 * Hook to use notification store
 */
export const useNotifications = () => {
  const store = useNotificationStore();
  const notifyHelpers = useNotify();

  return {
    notifications: store.notifications,
    addNotification: store.addNotification,
    removeNotification: store.removeNotification,
    clearNotifications: store.clearNotifications,
    updateNotification: store.updateNotification,
    ...notifyHelpers,
  };
};

/**
 * Hook to use auth store with convenience methods
 */
export const useAuth = () => {
  const store = useAuthStore();

  return {
    session: store.session,
    authToken: store.authToken,
    jwtPayload: store.jwtPayload,
    isInitialized: store.isInitialized,
    isLoading: store.isLoading,
    error: store.error,
    isTokenExpired: store.isTokenExpired(),
    tokenExpiryTime: store.getTokenExpiryTime(),
    tenantId: store.getTenantIdFromToken(),
    userId: store.getUserIdFromToken(),
    setSession: store.setSession,
    clearAuth: store.clearAuth,
  };
};
