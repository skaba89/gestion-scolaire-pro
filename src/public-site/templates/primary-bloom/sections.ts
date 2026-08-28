import type { SiteSection } from "../../types/sections";

/**
 * Starter section list for "démarrer depuis Primary Bloom" — NOT read at
 * render time (the template always renders live tenant data via
 * PrimaryBloomTemplate.tsx). Same convention as
 * school-excellence/sections.ts and campus-prestige/sections.ts.
 */
export const primaryBloomDefaultSections: SiteSection[] = [
  {
    type: "hero",
    title: "Votre nom d'établissement",
    subtitle: "Un environnement bienveillant pour l'épanouissement de chaque enfant.",
    settings: { cta_label: "Faire une pré-inscription", cta_url: "" },
  },
  {
    type: "text",
    title: "Qui sommes-nous",
    content: "<p>Présentez votre école : histoire, mission, valeurs pédagogiques.</p>",
  },
  {
    type: "stats",
    title: "Notre école en chiffres",
    items: [],
  },
  {
    type: "programs",
    title: "Nos classes",
    subtitle: "Une progression adaptée à chaque étape de la scolarité",
    items: [],
  },
  {
    type: "school_life",
    title: "La vie à l'école",
    items: [],
  },
  {
    type: "gallery",
    title: "Galerie photos",
    items: [],
  },
  {
    type: "news",
    title: "Infos pour les parents",
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
    settings: { cta_label: "Faire une pré-inscription", cta_url: "" },
  },
  {
    type: "contact_form",
    title: "Nous contacter",
  },
];
