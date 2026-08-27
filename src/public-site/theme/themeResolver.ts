import type { TenantLandingSettings } from "@/types/tenant";
import type { DesignTokens } from "./tokens";

/**
 * Merges a template's default design tokens with the tenant's own
 * branding overrides (already surfaced today via LandingPageEditor.tsx
 * -> TenantLandingSettings). Only the primitives the existing system
 * already exposes at the tenant level are overridable — everything else
 * (fonts, radii, spacing, shadow) stays the template's premium identity,
 * which is the whole point of picking a template rather than getting a
 * generic themeable shell.
 */
export function resolveTheme(
  templateDefaults: DesignTokens,
  tenantSettings: Pick<TenantLandingSettings, "primary_color" | "secondary_color">,
): DesignTokens {
  return {
    ...templateDefaults,
    primaryColor: tenantSettings.primary_color || templateDefaults.primaryColor,
    secondaryColor: tenantSettings.secondary_color || templateDefaults.secondaryColor,
  };
}
