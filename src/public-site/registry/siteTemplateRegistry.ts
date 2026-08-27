import type { TenantTemplateGroup } from "@/lib/tenantTemplateGroup";
import type { SiteTemplateDefinition } from "./types";
import { schoolExcellenceTemplate } from "../templates/school-excellence";
import { campusPrestigeTemplate } from "../templates/campus-prestige";

/** Central registry of site templates. Primary Bloom (primaire) will be
 * added here in a follow-up PR — the SiteTemplateDefinition shape and
 * this array are deliberately additive, so adding it later requires no
 * change to this file's structure. */
export const siteTemplateRegistry: SiteTemplateDefinition[] = [
  schoolExcellenceTemplate,
  campusPrestigeTemplate,
];

export function getSiteTemplate(id: string | null | undefined): SiteTemplateDefinition | undefined {
  if (!id) return undefined;
  return siteTemplateRegistry.find((t) => t.id === id && !t.comingSoon);
}

export function getSiteTemplatesFor(group: TenantTemplateGroup): SiteTemplateDefinition[] {
  return siteTemplateRegistry.filter((t) => !t.comingSoon && t.compatibleGroups.includes(group));
}
