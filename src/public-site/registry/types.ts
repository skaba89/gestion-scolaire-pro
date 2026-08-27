import type { ComponentType } from "react";
import type { TenantPublicResponse, TenantLandingSettings } from "@/types/tenant";
import type { TenantTemplateGroup } from "@/lib/tenantTemplateGroup";
import type { DesignTokens } from "../theme/tokens";
import type { SiteSection } from "../types/sections";

export interface SiteTemplateRenderProps {
  tenant: TenantPublicResponse;
  /** Same object TenantLanding.tsx already computes via
   * getLandingSettings(tenant) — passed through unchanged, never
   * re-fetched by the template itself. */
  settings: TenantLandingSettings;
}

export interface SiteTemplateDefinition {
  /** Stable key — this is what settings.landing.site_template_id stores. */
  id: string;
  name: string;
  description: string;
  category: "flagship" | "standard";
  /** Which tenantTemplateGroup(s) this template is designed for (see
   * src/lib/tenantTemplateGroup.ts). Used both to filter the admin
   * picker and as a runtime safety guard in TenantLanding.tsx: if a
   * tenant's type later becomes incompatible with a previously-chosen
   * template, rendering falls back to the legacy template instead of
   * showing a mismatched premium template. */
  compatibleGroups: TenantTemplateGroup[];
  defaultTokens: DesignTokens;
  /** Starter content for a future "start from this template" flow —
   * not read at render time (the template always renders live tenant
   * data), kept here for that future admin feature. */
  defaultSections: SiteSection[];
  render: ComponentType<SiteTemplateRenderProps>;
  previewImageUrl?: string;
  /** Registry stub for a template not yet implemented — omitted from
   * getSiteTemplatesFor() results so it never appears as a pickable
   * option before it's real. */
  comingSoon?: boolean;
}
