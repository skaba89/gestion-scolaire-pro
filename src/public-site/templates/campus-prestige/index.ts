import type { SiteTemplateDefinition } from "../../registry/types";
import { campusPrestigeTokens } from "./tokens";
import { campusPrestigeDefaultSections } from "./sections";
import { CampusPrestigeTemplate } from "./CampusPrestigeTemplate";

export const campusPrestigeTemplate: SiteTemplateDefinition = {
  id: "campus-prestige",
  name: "Campus Prestige",
  description: "Site premium pour université et enseignement supérieur — élégant, académique, à l'échelle internationale.",
  category: "flagship",
  compatibleGroups: ["university"],
  defaultTokens: campusPrestigeTokens,
  defaultSections: campusPrestigeDefaultSections,
  render: CampusPrestigeTemplate,
};
