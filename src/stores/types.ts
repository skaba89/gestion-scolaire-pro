import { AppRole } from "@/lib/types";

/**
 * Zustand Store Types
 * Shared type definitions for all stores
 */

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
  phone?: string;
  is_active: boolean;
  created_at?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  type?: string;
  is_active: boolean;
  settings?: Record<string, any>;
  created_at?: string;
}

export interface Permission {
  id: string;
  tenant_id: string;
  user_id: string;
  role: AppRole;
  created_at?: string;
}

export interface Notification {
  id: string;
  type: "success" | "error" | "warning" | "info";
  message: string;
  description?: string;
  duration?: number;
  timestamp: number;
}
