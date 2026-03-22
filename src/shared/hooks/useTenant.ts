/**
 * useTenant - Hook to access tenant context
 * Provides access to current tenant and tenant-related utilities
 */

import { useContext } from "react";
import { TenantContext } from "@/contexts/TenantContext";

export function useTenant() {
  const context = useContext(TenantContext);
  
  if (!context) {
    throw new Error("useTenant must be used within TenantProvider");
  }

  return context;
}
