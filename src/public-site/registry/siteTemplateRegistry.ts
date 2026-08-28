import type { TenantTemplateGroup } from "@/lib/tenantTemplateGroup";
import type { SiteTemplateDefinition } from "./types";
import { schoolExcellenceTemplate } from "../templates/school-excellence";
import { campusPrestigeTemplate } from "../templates/campus-prestige";
import { primaryBloomTemplate } from "../templates/primary-bloom";

/** Central registry of site templates — the SiteTemplateDefinition shape
 * and this array are deliberately additive, so a future 4th template
 * requires no change to this file's structure beyond one import + one
 * array entry. */
export const siteTemplateRegistry: SiteTemplateDefinition[] = [
  schoolExcellenceTemplate,
  campusPrestigeTemplate,
  primaryBloomTemplate,
];

export function getSiteTemplate(id: string | null | undefined): SiteTemplateDefinition | undefined {
  if (!id) return undefined;
  return siteTemplateRegistry.find((t) => t.id === id && !t.comingSoon);
}

export function getSiteTemplatesFor(group: TenantTemplateGroup): SiteTemplateDefinition[] {
  return siteTemplateRegistry.filter((t) => !t.comingSoon && t.compatibleGroups.includes(group));
}
