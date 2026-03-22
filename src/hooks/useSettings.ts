/**
 * useSettings Hook
 * Manages dynamic tenant settings with caching
 * 
 * Features:
 * - Reactive settings from tenant JSONB settings field
 * - Automatic cache invalidation (5-min TTL)
 * - Type-safe settings access
 * - Real-time updates via Supabase subscriptions
 * - Fallback defaults for backward compatibility
 */

import { useSettingsContext, TenantSettingsSchema } from "@/components/providers/SettingsProvider";

/**
 * Hook: useSettings
 * Access and manage tenant settings via centralized SettingsProvider
 * 
 * @returns {Object} Settings object with methods to get/update
 */
export function useSettings() {
  const context = useSettingsContext();

  return {
    settings: context.settings,
    isLoading: context.isLoading,
    isUpdating: context.isUpdating,
    updateSetting: context.updateSetting,
    updateSettings: context.updateSettings,
    resetSettings: context.resetSettings,
    refetch: context.refetch,
    getSetting: (key: keyof TenantSettingsSchema, defaultValue?: any) => {
      const val = context.settings[key];
      return val !== undefined ? val : defaultValue;
    }
  };
}

/**
 * Type-safe hook for getting a specific setting
 */
export function useSetting<K extends keyof TenantSettingsSchema>(
  key: K,
  defaultValue?: TenantSettingsSchema[K]
): TenantSettingsSchema[K] | undefined {
  const { settings } = useSettings();
  const val = settings[key];
  return val !== undefined ? val : defaultValue;
}

export type { TenantSettingsSchema };
