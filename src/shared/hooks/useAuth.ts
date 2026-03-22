/**
 * useAuth - Hook to access auth context
 * Provides access to user, roles, and auth utilities
 */

import { useContext } from "react";
import { AuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
