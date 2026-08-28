import type { SiteTemplateDefinition } from "../../registry/types";
import { primaryBloomTokens } from "./tokens";
import { primaryBloomDefaultSections } from "./sections";
import { PrimaryBloomTemplate } from "./PrimaryBloomTemplate";

export const primaryBloomTemplate: SiteTemplateDefinition = {
  id: "primary-bloom",
  name: "Primary Bloom",
  description: "Site premium chaleureux pour écoles primaires — accueillant, rassurant, pensé pour les parents.",
  category: "flagship",
  compatibleGroups: ["primary"],
  defaultTokens: primaryBloomTokens,
  defaultSections: primaryBloomDefaultSections,
  render: PrimaryBloomTemplate,
};
