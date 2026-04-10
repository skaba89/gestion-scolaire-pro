/**
 * Custom Hooks for Zustand Store Integration
 *
 * DEPRECATED: The useUser, useTenant, and useAuth hooks here were thin wrappers
 * around the deprecated Zustand auth/user/tenant stores. Those stores have been
 * removed in favour of React Context (AuthContext, TenantContext).
 *
 * Consumers should import directly from the Context modules:
 *   - import { useAuth } from "@/contexts/AuthContext";
 *   - import { useTenant } from "@/contexts/TenantContext";
 *
 * The notification hooks remain as they still use the active notificationStore.
 */

import { useNotificationStore, useNotify } from "@/stores/notificationStore";

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
