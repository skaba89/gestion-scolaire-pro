// Starter page bundles offered per establishment type when setting up
// "Pages publiques" for the first time. Each bundle matches the same
// tenant.type → group classification the actual landing page uses
// (getTenantTemplateGroup) — so what an admin picks here lines up with
// the template their homepage already renders (Formations/Campus nav +
// hero/mission/programs sections), rather than a second, disconnected
// taxonomy.
//
// Content is deliberately a scaffold to fill in, not invented marketing
// copy — every section starts with a short "à compléter" placeholder
// (see the fake-homepage-schools incident earlier this session: never
// publish content for a real institution that wasn't actually provided).
// Pages are created as drafts (is_published: false) so nothing goes live
// until the admin has actually written something.
import type { PublicPageSection } from "@/hooks/usePublicPages";
import type { TenantTemplateGroup } from "@/lib/tenantTemplateGroup";

export interface PageTemplate {
  title: string;
  slug: string;
  page_type: string;
  nav_label: string;
  description: string; // shown in the picker, not saved
  content: PublicPageSection[];
}

function textSection(title: string, placeholder: string): PublicPageSection {
  return {
    type: "text",
    title,
    subtitle: "",
    content: `<p>${placeholder}</p>`,
    items: [],
    settings: {},
  };
}

function faqSection(): PublicPageSection {
  return {
    type: "faq",
    title: "Questions fréquentes",
    subtitle: "",
    content: "",
    items: [
      { question: "À compléter", answer: "Remplacez cette question et sa réponse par les vôtres." },
    ],
    settings: {},
  };
}

const ABOUT_PAGE = (nom: string): PageTemplate => ({
  title: "Qui sommes-nous",
  slug: "qui-sommes-nous",
  page_type: "ABOUT",
  nav_label: "Qui sommes-nous",
  description: "Histoire, mission et valeurs de l'établissement.",
  content: [
    textSection("Notre histoire", `À compléter : présentez ${nom} — date de création, fondateur(s), parcours.`),
    textSection("Notre mission", "À compléter : la mission de l'établissement en quelques phrases."),
    { type: "features", title: "Nos valeurs", subtitle: "", content: "", settings: { columns: "3" }, items: [
      { icon: "star", title: "À compléter", description: "Décrivez une première valeur." },
      { icon: "heart", title: "À compléter", description: "Décrivez une deuxième valeur." },
      { icon: "sparkles", title: "À compléter", description: "Décrivez une troisième valeur." },
    ] },
  ],
});

const CONTACT_FORM_PAGE: PageTemplate = {
  title: "Contact",
  slug: "contact",
  page_type: "CONTACT",
  nav_label: "Contact",
  description: "Formulaire de contact — les messages arrivent dans \"Messages reçus\".",
  content: [
    { type: "contact_form", title: "Contactez-nous", subtitle: "Une question ? Écrivez-nous.", content: "", items: [], settings: {} },
  ],
};

const FAQ_PAGE: PageTemplate = {
  title: "FAQ",
  slug: "faq",
  page_type: "CUSTOM",
  nav_label: "FAQ",
  description: "Questions fréquentes des familles/étudiants.",
  content: [faqSection()],
};

const TEMPLATES_BY_GROUP: Record<TenantTemplateGroup, PageTemplate[]> = {
  university: [
    ABOUT_PAGE("l'université"),
    {
      title: "Recherche",
      slug: "recherche",
      page_type: "RESEARCH",
      nav_label: "Recherche",
      description: "Laboratoires, axes de recherche, publications.",
      content: [
        textSection("Nos axes de recherche", "À compléter : présentez les laboratoires et thématiques de recherche."),
      ],
    },
    {
      title: "Vie étudiante",
      slug: "vie-etudiante",
      page_type: "CUSTOM",
      nav_label: "Vie étudiante",
      description: "Clubs, associations, campus, logement.",
      content: [
        textSection("La vie sur le campus", "À compléter : clubs, associations étudiantes, événements, logement."),
      ],
    },
    {
      title: "International",
      slug: "international",
      page_type: "CUSTOM",
      nav_label: "International",
      description: "Partenariats, échanges, mobilité.",
      content: [
        textSection("Partenariats internationaux", "À compléter : accords d'échange, universités partenaires, mobilité étudiante."),
      ],
    },
    CONTACT_FORM_PAGE,
    FAQ_PAGE,
  ],
  highschool: [
    ABOUT_PAGE("l'établissement"),
    {
      title: "Vie scolaire",
      slug: "vie-scolaire",
      page_type: "CUSTOM",
      nav_label: "Vie scolaire",
      description: "Clubs, activités périscolaires, internat.",
      content: [
        textSection("La vie scolaire", "À compléter : clubs, activités périscolaires, internat, restauration."),
      ],
    },
    CONTACT_FORM_PAGE,
    FAQ_PAGE,
  ],
  primary: [
    ABOUT_PAGE("l'école"),
    {
      title: "Activités",
      slug: "activites",
      page_type: "CUSTOM",
      nav_label: "Activités",
      description: "Sport, art, sorties scolaires.",
      content: [
        { type: "features", title: "Nos activités", subtitle: "", content: "", settings: { columns: "3" }, items: [
          { icon: "star", title: "À compléter", description: "Décrivez une première activité." },
          { icon: "heart", title: "À compléter", description: "Décrivez une deuxième activité." },
        ] },
      ],
    },
    CONTACT_FORM_PAGE,
    FAQ_PAGE,
  ],
  default: [
    ABOUT_PAGE("l'établissement"),
    CONTACT_FORM_PAGE,
    FAQ_PAGE,
  ],
};

export function getPageTemplatesFor(group: TenantTemplateGroup): PageTemplate[] {
  return TEMPLATES_BY_GROUP[group];
}
