/**
 * Zustand App Store
 * Global application state management
 * Eliminates prop drilling for common state
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { User, Tenant, Permission, Notification, AppRole } from "./types";

interface AppState {
  // User state
  user: User | null;
  setUser: (user: User | null) => void;

  // Tenant state
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant | null) => void;
  tenants: Tenant[];
  setTenants: (tenants: Tenant[]) => void;

  // Permissions (cached)
  permissions: Permission[];
  setPermissions: (perms: Permission[]) => void;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  isAdmin: () => boolean;

  // UI state
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Theme
  theme: "light" | "dark";
  setTheme: (theme: "light" | "dark") => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id" | "timestamp">) => void;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;

  // Auth state
  isAuthenticated: boolean;
  setIsAuthenticated: (auth: boolean) => void;

  // Loading state
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Batch auth sync (for preventing render-phase updates)
  syncAuth: (data: {
    user: User | null;
    currentTenant: Tenant | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    permissions: Permission[];
  }) => void;

  // Reset all state
  reset: () => void;
}

const initialState = {
  user: null,
  currentTenant: null,
  tenants: [],
  permissions: [],
  sidebarOpen: true,
  theme: "light" as const,
  notifications: [],
  isAuthenticated: false,
  isLoading: false,
};

export const useAppStore = create<AppState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      setUser: (user) => set({ user }),

      setCurrentTenant: (tenant) => set({ currentTenant: tenant }),

      setTenants: (tenants) => set({ tenants }),

      setPermissions: (permissions) => set({ permissions }),

      hasRole: (role) => {
        const { permissions, currentTenant } = get();
        if (!currentTenant) return false;
        return permissions.some(
          (p) =>
            p.tenant_id === currentTenant.id &&
            p.role === role
        );
      },

      hasAnyRole: (roles) => {
        const { permissions, currentTenant } = get();
        if (!currentTenant) return false;
        return permissions.some(
          (p) =>
            p.tenant_id === currentTenant.id &&
            roles.includes(p.role)
        );
      },

      isAdmin: () => {
        const { hasRole } = get();
        return hasRole("SUPER_ADMIN") || hasRole("TENANT_ADMIN");
      },

      toggleSidebar: () =>
        set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      setTheme: (theme) => {
        set({ theme });
        // Persist to localStorage
        localStorage.setItem("theme", theme);
        // Apply to document
        if (theme === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      },

      addNotification: (notification) => {
        const id = `${Date.now()}-${Math.random()}`;
        const newNotification: Notification = {
          ...notification,
          id,
          timestamp: Date.now(),
        };

        set((state) => ({
          notifications: [...state.notifications, newNotification],
        }));

        // Auto-remove after duration
        if (notification.duration !== 0) {
          setTimeout(() => {
            get().removeNotification(id);
          }, notification.duration || 5000);
        }
      },

      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),

      clearNotifications: () => set({ notifications: [] }),

      setIsAuthenticated: (auth) => set({ isAuthenticated: auth }),

      setIsLoading: (loading) => set({ isLoading: loading }),

      // Batch update for auth sync (single state mutation)
      syncAuth: (data) => set({
        user: data.user,
        currentTenant: data.currentTenant,
        isAuthenticated: data.isAuthenticated,
        isLoading: data.isLoading,
        permissions: data.permissions,
      }),

      reset: () => set(initialState),
    }),
    { name: "AppStore" }
  )
);

// Selector for convenience
export const useUser = () => useAppStore((state) => state.user);
export const useCurrentTenant = () => useAppStore((state) => state.currentTenant);
export const usePermissions = () => useAppStore((state) => state.permissions);
export const useSidebar = () => useAppStore((state) => ({ 
  open: state.sidebarOpen, 
  toggle: state.toggleSidebar,
  set: state.setSidebarOpen,
}));
export const useTheme = () => useAppStore((state) => ({ 
  theme: state.theme, 
  setTheme: state.setTheme 
}));
export const useNotifications = () => useAppStore((state) => ({
  notifications: state.notifications,
  add: state.addNotification,
  remove: state.removeNotification,
  clear: state.clearNotifications,
}));
