import type { SiteSection } from "../../types/sections";

/**
 * Starter section list for "démarrer depuis School Excellence" — NOT
 * read at render time (the template always renders live tenant data via
 * SchoolExcellenceTemplate.tsx). Kept here for a future admin flow that
 * lets a tenant scaffold a page from a template's defaults, matching
 * the shape publicPageTemplates.ts already uses for page-level starter
 * bundles.
 */
export const schoolExcellenceDefaultSections: SiteSection[] = [
  {
    type: "hero",
    title: "Votre nom d'établissement",
    subtitle: "Excellence académique et formation complète pour préparer l'avenir de vos élèves.",
    settings: { cta_label: "Faire une pré-inscription", cta_url: "" },
  },
  {
    type: "text",
    title: "Qui sommes-nous",
    content: "<p>Présentez votre établissement : histoire, mission, valeurs.</p>",
  },
  {
    type: "stats",
    title: "Chiffres clés",
    items: [],
  },
  {
    type: "programs",
    title: "Nos filières",
    subtitle: "Des formations adaptées à chaque projet d'avenir",
    items: [],
  },
  {
    type: "results",
    title: "Nos résultats",
    items: [],
  },
  {
    type: "school_life",
    title: "Vie scolaire",
    items: [],
  },
  {
    type: "gallery",
    title: "Galerie photos",
    items: [],
  },
  {
    type: "testimonials",
    title: "Ils nous font confiance",
    items: [],
  },
  {
    type: "events",
    title: "Agenda",
    items: [],
  },
  {
    type: "faq",
    title: "Questions fréquentes",
    items: [],
  },
  {
    type: "cta",
    title: "Prêt à nous rejoindre ?",
    settings: { cta_label: "Déposer ma candidature", cta_url: "" },
  },
  {
    type: "contact_form",
    title: "Nous contacter",
  },
];
