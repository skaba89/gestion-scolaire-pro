import type { TenantTemplateGroup } from "@/lib/tenantTemplateGroup";
import type { SiteTemplateDefinition } from "./types";
import { schoolExcellenceTemplate } from "../templates/school-excellence";

/** Central registry of site templates. Campus Prestige (université) and
 * Primary Bloom (primaire) will be added here in follow-up PRs, once
 * this foundation has proven itself on School Excellence — the
 * SiteTemplateDefinition shape and this array are deliberately additive,
 * so adding them later requires no change to this file's structure. */
export const siteTemplateRegistry: SiteTemplateDefinition[] = [
  schoolExcellenceTemplate,
];

export function getSiteTemplate(id: string | null | undefined): SiteTemplateDefinition | undefined {
  if (!id) return undefined;
  return siteTemplateRegistry.find((t) => t.id === id && !t.comingSoon);
}

export function getSiteTemplatesFor(group: TenantTemplateGroup): SiteTemplateDefinition[] {
  return siteTemplateRegistry.filter((t) => !t.comingSoon && t.compatibleGroups.includes(group));
}
