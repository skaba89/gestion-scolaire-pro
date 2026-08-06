// Starter page bundles offered per establishment type when setting up
// "Pages publiques" for the first time. Each bundle matches the same
// tenant.type → group classification the actual landing page uses
// (getTenantTemplateGroup) — so what an admin picks here lines up with
// the template their homepage already renders (Formations/Campus nav +
// hero/mission/programs sections), rather than a second, disconnected
// taxonomy.
//
// Each page combines several real widget types (hero, text, features,
// stats, gallery, timeline, testimonials, faq, cta, contact_form) into a
// realistic, already-laid-out page — not a single empty text block — so
// there's an actual structure to adapt rather than a blank page. The
// wording itself stays a scaffold ("à compléter", "Décrivez ici…"): the
// LAYOUT is pre-built and real, the FACTS about a specific institution
// are not invented (see the fake-homepage-schools incident earlier this
// session — never publish specific claims about a real institution that
// weren't actually provided). Pages are created as drafts
// (is_published: false) so nothing goes live until the admin has
// actually written something.
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

// ─── Section builders ──────────────────────────────────────────────────

function hero(title: string, subtitle: string): PublicPageSection {
  return { type: "hero", title, subtitle, content: "", items: [], settings: {} };
}

function text(title: string, placeholder: string, subtitle = ""): PublicPageSection {
  return { type: "text", title, subtitle, content: `<p>${placeholder}</p>`, items: [], settings: {} };
}

function features(
  title: string,
  subtitle: string,
  items: { icon: string; title: string; description: string }[]
): PublicPageSection {
  return { type: "features", title, subtitle, content: "", settings: { columns: "3" }, items };
}

function stats(title: string, items: { icon: string; value: string; label: string }[]): PublicPageSection {
  return { type: "stats", title, subtitle: "", content: "", settings: {}, items };
}

function gallery(title: string, subtitle: string): PublicPageSection {
  return {
    type: "gallery", title, subtitle, content: "", settings: {},
    items: [{ url: "", caption: "Ajoutez vos photos ici" }],
  };
}

function timeline(title: string, subtitle: string): PublicPageSection {
  return {
    type: "timeline", title, subtitle, content: "", settings: {},
    items: [
      { date: "À compléter", title: "Étape clé", description: "Décrivez cette étape." },
      { date: "À compléter", title: "Étape clé", description: "Décrivez cette étape." },
    ],
  };
}

function testimonials(title: string, subtitle: string): PublicPageSection {
  return {
    type: "testimonials", title, subtitle, content: "", settings: {},
    items: [
      { name: "À compléter", role: "Fonction / rôle", text: "Remplacez par un vrai témoignage." },
      { name: "À compléter", role: "Fonction / rôle", text: "Remplacez par un vrai témoignage." },
    ],
  };
}

function faq(title = "Questions fréquentes"): PublicPageSection {
  return {
    type: "faq", title, subtitle: "", content: "", settings: {},
    items: [
      { question: "À compléter", answer: "Remplacez cette question et sa réponse par les vôtres." },
      { question: "À compléter", answer: "Remplacez cette question et sa réponse par les vôtres." },
    ],
  };
}

function cta(title: string, message: string, ctaLabel: string, ctaUrl?: string): PublicPageSection {
  return {
    type: "cta", title, subtitle: "", content: message, items: [],
    settings: { cta_label: ctaLabel, cta_url: ctaUrl },
  };
}

function contactForm(title: string, subtitle: string): PublicPageSection {
  return { type: "contact_form", title, subtitle, content: "", items: [], settings: {} };
}

// ─── Shared pages (offered in every group) ──────────────────────────────

const CONTACT_PAGE: PageTemplate = {
  title: "Contact",
  slug: "contact",
  page_type: "CONTACT",
  nav_label: "Contact",
  description: "Formulaire de contact réel — les messages arrivent dans \"Messages reçus\".",
  content: [
    hero("Contactez-nous", "Une question ? Nous sommes à votre écoute."),
    contactForm("Envoyez-nous un message", ""),
  ],
};

const FAQ_PAGE: PageTemplate = {
  title: "FAQ",
  slug: "faq",
  page_type: "CUSTOM",
  nav_label: "FAQ",
  description: "Questions fréquentes des familles/étudiants.",
  content: [hero("Questions fréquentes", "Les réponses aux questions les plus courantes."), faq()],
};

function aboutPage(nom: string): PageTemplate {
  return {
    title: "Qui sommes-nous",
    slug: "qui-sommes-nous",
    page_type: "ABOUT",
    nav_label: "Qui sommes-nous",
    description: "Histoire, mission, valeurs et chiffres clés — page la plus complète, à personnaliser en premier.",
    content: [
      hero("Qui sommes-nous", `Découvrez ${nom}`),
      text("Notre histoire", `À compléter : présentez ${nom} — date de création, fondateur(s), parcours.`),
      timeline("Notre parcours", "Les grandes étapes de notre histoire"),
      features("Nos valeurs", "", [
        { icon: "star", title: "À compléter", description: "Décrivez une première valeur." },
        { icon: "heart", title: "À compléter", description: "Décrivez une deuxième valeur." },
        { icon: "sparkles", title: "À compléter", description: "Décrivez une troisième valeur." },
      ]),
      stats("En quelques chiffres", [
        { icon: "users", value: "0", label: "À compléter" },
        { icon: "graduation", value: "0", label: "À compléter" },
        { icon: "award", value: "0", label: "À compléter" },
      ]),
      cta("Envie d'en savoir plus ?", "Contactez-nous ou déposez votre candidature.", "Nous contacter", "/contact"),
    ],
  };
}

function admissionsPage(): PageTemplate {
  return {
    title: "Admissions",
    slug: "admissions-infos",
    page_type: "ADMISSION",
    nav_label: "Admissions",
    description: "Procédure, conditions et FAQ d'admission — complète la page de candidature en ligne.",
    content: [
      hero("Admissions", "Comment nous rejoindre"),
      text("Conditions d'admission", "À compléter : diplômes requis, dossier, dates limites."),
      text("Procédure", "À compléter : les étapes, du dossier à l'inscription."),
      faq("Questions sur l'admission"),
      cta("Prêt(e) à candidater ?", "Déposez votre dossier en ligne dès maintenant.", "Candidater"),
    ],
  };
}

// ─── University ──────────────────────────────────────────────────────────

const UNIVERSITY_TEMPLATES: PageTemplate[] = [
  aboutPage("l'université"),
  admissionsPage(),
  {
    title: "Recherche",
    slug: "recherche",
    page_type: "RESEARCH",
    nav_label: "Recherche",
    description: "Laboratoires, axes de recherche, publications.",
    content: [
      hero("Recherche", "Nos laboratoires et thématiques de recherche"),
      text("Nos axes de recherche", "À compléter : présentez les laboratoires et thématiques."),
      features("Nos laboratoires", "", [
        { icon: "target", title: "À compléter", description: "Décrivez un premier laboratoire ou axe." },
        { icon: "eye", title: "À compléter", description: "Décrivez un deuxième laboratoire ou axe." },
      ]),
      gallery("Nos installations", ""),
    ],
  },
  {
    title: "Vie étudiante",
    slug: "vie-etudiante",
    page_type: "CUSTOM",
    nav_label: "Vie étudiante",
    description: "Clubs, associations, campus, logement, témoignages.",
    content: [
      hero("Vie étudiante", "La vie sur notre campus"),
      features("Clubs et associations", "", [
        { icon: "users", title: "À compléter", description: "Décrivez un premier club/association." },
        { icon: "heart", title: "À compléter", description: "Décrivez un deuxième club/association." },
        { icon: "star", title: "À compléter", description: "Décrivez un troisième club/association." },
      ]),
      gallery("La vie sur le campus", ""),
      testimonials("Ils témoignent", "Nos étudiants racontent leur expérience"),
    ],
  },
  {
    title: "International",
    slug: "international",
    page_type: "CUSTOM",
    nav_label: "International",
    description: "Partenariats, échanges, mobilité étudiante.",
    content: [
      hero("International", "Ouverture sur le monde"),
      text("Partenariats internationaux", "À compléter : accords d'échange, universités partenaires."),
      features("Nos partenaires", "", [
        { icon: "globe", title: "À compléter", description: "Nom du partenaire / pays." },
        { icon: "globe", title: "À compléter", description: "Nom du partenaire / pays." },
      ]),
    ],
  },
  {
    title: "Anciens élèves",
    slug: "anciens-eleves",
    page_type: "CUSTOM",
    nav_label: "Alumni",
    description: "Réseau des diplômés, parcours, témoignages.",
    content: [
      hero("Anciens élèves", "Le réseau de nos diplômés"),
      text("Notre réseau alumni", "À compléter : présentez le réseau et ses avantages."),
      testimonials("Parcours de diplômés", "Où sont-ils aujourd'hui ?"),
    ],
  },
  CONTACT_PAGE,
  FAQ_PAGE,
];

// ─── High school ─────────────────────────────────────────────────────────

const HIGHSCHOOL_TEMPLATES: PageTemplate[] = [
  aboutPage("l'établissement"),
  admissionsPage(),
  {
    title: "Vie scolaire",
    slug: "vie-scolaire",
    page_type: "CUSTOM",
    nav_label: "Vie scolaire",
    description: "Clubs, activités périscolaires, internat, restauration.",
    content: [
      hero("Vie scolaire", "La vie au sein de notre établissement"),
      features("Activités périscolaires", "", [
        { icon: "star", title: "À compléter", description: "Décrivez une première activité." },
        { icon: "heart", title: "À compléter", description: "Décrivez une deuxième activité." },
        { icon: "sparkles", title: "À compléter", description: "Décrivez une troisième activité." },
      ]),
      gallery("La vie scolaire en images", ""),
      testimonials("Ils témoignent", "Élèves et parents racontent leur expérience"),
    ],
  },
  {
    title: "Résultats & Réussite",
    slug: "resultats",
    page_type: "CUSTOM",
    nav_label: "Résultats",
    description: "Taux de réussite aux examens, chiffres clés.",
    content: [
      hero("Nos résultats", "La réussite de nos élèves"),
      stats("En chiffres", [
        { icon: "award", value: "0%", label: "À compléter (ex: taux de réussite)" },
        { icon: "graduation", value: "0", label: "À compléter (ex: mentions)" },
      ]),
      text("Notre accompagnement", "À compléter : méthode pédagogique, soutien scolaire."),
    ],
  },
  CONTACT_PAGE,
  FAQ_PAGE,
];

// ─── Primary school ────────────────────────────────────────────────────

const PRIMARY_TEMPLATES: PageTemplate[] = [
  {
    title: "Notre école",
    slug: "notre-ecole",
    page_type: "ABOUT",
    nav_label: "Notre école",
    description: "Présentation, valeurs et chiffres clés de l'école.",
    content: [
      hero("Notre école", "Un environnement bienveillant pour votre enfant"),
      text("Notre projet éducatif", "À compléter : présentez l'école et son approche pédagogique."),
      features("Nos valeurs", "", [
        { icon: "heart", title: "À compléter", description: "Décrivez une première valeur." },
        { icon: "star", title: "À compléter", description: "Décrivez une deuxième valeur." },
      ]),
      stats("En quelques chiffres", [
        { icon: "users", value: "0", label: "Élèves" },
        { icon: "graduation", value: "0", label: "Enseignants" },
      ]),
    ],
  },
  {
    title: "Activités",
    slug: "activites",
    page_type: "CUSTOM",
    nav_label: "Activités",
    description: "Sport, art, sorties scolaires.",
    content: [
      hero("Nos activités", "Sport, art et découvertes"),
      features("Nos activités", "", [
        { icon: "star", title: "À compléter", description: "Décrivez une première activité." },
        { icon: "heart", title: "À compléter", description: "Décrivez une deuxième activité." },
      ]),
      gallery("En images", ""),
    ],
  },
  {
    title: "Vie de l'école",
    slug: "vie-ecole",
    page_type: "CUSTOM",
    nav_label: "Vie de l'école",
    description: "Journée type, cantine, garderie.",
    content: [
      hero("La vie à l'école", "Une journée type"),
      text("Journée type", "À compléter : horaires, cantine, garderie."),
    ],
  },
  admissionsPage(),
  CONTACT_PAGE,
  FAQ_PAGE,
];

// ─── Default / training centers / other types ───────────────────────────

const DEFAULT_TEMPLATES: PageTemplate[] = [
  aboutPage("l'établissement"),
  {
    title: "Certifications",
    slug: "certifications",
    page_type: "CUSTOM",
    nav_label: "Certifications",
    description: "Diplômes et certifications reconnus.",
    content: [
      hero("Certifications", "Des formations reconnues"),
      features("Nos certifications", "", [
        { icon: "award", title: "À compléter", description: "Nom de la certification." },
        { icon: "award", title: "À compléter", description: "Nom de la certification." },
      ]),
    ],
  },
  admissionsPage(),
  {
    title: "Témoignages",
    slug: "temoignages",
    page_type: "CUSTOM",
    nav_label: "Témoignages",
    description: "Retours d'anciens stagiaires/élèves.",
    content: [
      hero("Ils nous font confiance", "Témoignages"),
      testimonials("Nos anciens témoignent", ""),
    ],
  },
  CONTACT_PAGE,
  FAQ_PAGE,
];

const TEMPLATES_BY_GROUP: Record<TenantTemplateGroup, PageTemplate[]> = {
  university: UNIVERSITY_TEMPLATES,
  highschool: HIGHSCHOOL_TEMPLATES,
  primary: PRIMARY_TEMPLATES,
  default: DEFAULT_TEMPLATES,
};

export function getPageTemplatesFor(group: TenantTemplateGroup): PageTemplate[] {
  return TEMPLATES_BY_GROUP[group];
}
