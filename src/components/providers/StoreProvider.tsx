/**
 * Store Provider Component
 * Initializes Zustand stores with localStorage persistence
 */

import { ReactNode, useEffect } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useUserStore } from "@/stores/userStore";
import { useTenantStore } from "@/stores/tenantStore";

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  useEffect(() => {
    // Initialize auth store from localStorage if available
    const authState = localStorage.getItem("auth-store");
    if (authState) {
      try {
        const parsed = JSON.parse(authState);
        const state = parsed.state || {};
        useAuthStore.setState({
          session: state.session || null,
          authToken: state.authToken || null,
          jwtPayload: state.jwtPayload || null,
          isInitialized: state.isInitialized || false,
        });
      } catch (error) {
        console.error("Failed to restore auth store:", error);
      }
    }

    // Initialize user store from localStorage if available
    const userState = localStorage.getItem("user-store");
    if (userState) {
      try {
        const parsed = JSON.parse(userState);
        const state = parsed.state || {};
        useUserStore.setState({
          user: state.user || null,
          roles: state.roles || [],
          isAuthenticated: state.isAuthenticated || false,
        });
      } catch (error) {
        console.error("Failed to restore user store:", error);
      }
    }

    // Initialize tenant store from localStorage if available
    const tenantState = localStorage.getItem("tenant-store");
    if (tenantState) {
      try {
        const parsed = JSON.parse(tenantState);
        const state = parsed.state || {};
        useTenantStore.setState({
          currentTenant: state.currentTenant || null,
          tenants: state.tenants || [],
        });
      } catch (error) {
        console.error("Failed to restore tenant store:", error);
      }
    }

    useAuthStore.setState({ isInitialized: true });
  }, []);

  return <>{children}</>;
}
