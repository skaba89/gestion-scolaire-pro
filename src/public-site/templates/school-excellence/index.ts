import type { SiteTemplateDefinition } from "../../registry/types";
import { schoolExcellenceTokens } from "./tokens";
import { schoolExcellenceDefaultSections } from "./sections";
import { SchoolExcellenceTemplate } from "./SchoolExcellenceTemplate";

export const schoolExcellenceTemplate: SiteTemplateDefinition = {
  id: "school-excellence",
  name: "School Excellence",
  description: "Site premium institutionnel pour lycées et collèges — élégant, rassurant, grand format photographique.",
  category: "flagship",
  compatibleGroups: ["highschool"],
  defaultTokens: schoolExcellenceTokens,
  defaultSections: schoolExcellenceDefaultSections,
  render: SchoolExcellenceTemplate,
};
