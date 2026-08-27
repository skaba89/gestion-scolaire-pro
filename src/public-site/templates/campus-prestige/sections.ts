import type { SiteSection } from "../../types/sections";

/**
 * Starter section list for "démarrer depuis Campus Prestige" — NOT read
 * at render time (same convention as School Excellence's sections.ts).
 */
export const campusPrestigeDefaultSections: SiteSection[] = [
  {
    type: "hero",
    title: "Votre nom d'université",
    subtitle: "Une formation d'excellence, une ouverture sur le monde.",
    settings: { cta_label: "Faire une candidature", cta_url: "" },
  },
  {
    type: "text",
    title: "Qui sommes-nous",
    content: "<p>Présentez votre université : histoire, mission, valeurs.</p>",
  },
  { type: "stats", title: "Chiffres clés", items: [] },
  { type: "programs", title: "Nos formations", subtitle: "Des parcours reconnus pour construire votre avenir", items: [] },
  { type: "programs", title: "Facultés & Départements", items: [] },
  { type: "gallery", title: "Le campus", items: [] },
  { type: "news", title: "Actualités", items: [] },
  { type: "testimonials", title: "Ils nous font confiance", items: [] },
  { type: "faq", title: "Questions fréquentes", items: [] },
  { type: "cta", title: "Prêt à nous rejoindre ?", settings: { cta_label: "Déposer ma candidature", cta_url: "" } },
  { type: "contact_form", title: "Nous contacter" },
];
