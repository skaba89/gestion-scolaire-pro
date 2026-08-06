// Config-driven metadata for the public page "widget" builder
// (PublicPagesManager's visual section editor). Field lists here must stay
// in sync with what the section renderers in
// src/pages/public/PublicPageView.tsx actually read — that file is the
// ground truth for what each type's `content`/`subtitle`/`settings`/`items`
// fields do; this file just describes how to *edit* them.
import type { PublicPageSection } from "@/hooks/usePublicPages";

export type FieldKind = "text" | "textarea" | "html" | "url" | "checkbox" | "number" | "select" | "icon";

export interface FieldConfig {
  key: string;
  label: string;
  kind: FieldKind;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

export interface SectionTypeConfig {
  type: string;
  label: string;
  description: string;
  hasTitle: boolean;
  hasSubtitle: boolean;
  /** Whether the section's top-level `content` field is used, and how. */
  content: null | { label: string; kind: "textarea" | "html" };
  settingsFields: FieldConfig[];
  /** If set, this section renders a repeatable `items` array with these fields per item. */
  itemFields: FieldConfig[] | null;
  itemLabel?: string;
}

const ICON_OPTIONS = [
  "book", "users", "award", "star", "target", "eye", "heart",
  "sparkles", "globe", "graduation", "message", "clock",
].map((v) => ({ value: v, label: v }));

export const SECTION_TYPES: SectionTypeConfig[] = [
  {
    type: "hero",
    label: "En-tête (Hero)",
    description: "Grand bandeau d'accueil en haut de page, avec titre et boutons d'action.",
    hasTitle: true,
    hasSubtitle: true,
    content: { label: "Texte additionnel (optionnel)", kind: "textarea" },
    settingsFields: [
      { key: "background_image", label: "Image de fond (URL)", kind: "url" },
      { key: "cta_label", label: "Bouton principal — texte", kind: "text" },
      { key: "cta_url", label: "Bouton principal — lien", kind: "url" },
      { key: "cta_label_2", label: "Bouton secondaire — texte", kind: "text" },
      { key: "cta_url_2", label: "Bouton secondaire — lien", kind: "url" },
    ],
    itemFields: null,
  },
  {
    type: "text",
    label: "Texte",
    description: "Bloc de texte simple (titre + paragraphe).",
    hasTitle: true,
    hasSubtitle: true,
    content: { label: "Contenu (HTML autorisé)", kind: "html" },
    settingsFields: [
      { key: "label", label: "Sur-titre (petit texte au-dessus)", kind: "text" },
      { key: "centered", label: "Centrer le texte", kind: "checkbox" },
      { key: "gray", label: "Fond gris clair", kind: "checkbox" },
      { key: "dark", label: "Fond sombre", kind: "checkbox" },
    ],
    itemFields: null,
  },
  {
    type: "features",
    label: "Points forts",
    description: "Grille de cartes avec icône, titre et description (ex: nos atouts).",
    hasTitle: true,
    hasSubtitle: true,
    content: null,
    settingsFields: [
      { key: "label", label: "Sur-titre", kind: "text" },
      { key: "columns", label: "Colonnes", kind: "select", options: [{ value: "2", label: "2" }, { value: "3", label: "3" }] },
    ],
    itemFields: [
      { key: "icon", label: "Icône", kind: "icon", options: ICON_OPTIONS },
      { key: "title", label: "Titre", kind: "text" },
      { key: "description", label: "Description", kind: "textarea" },
    ],
    itemLabel: "Point fort",
  },
  {
    type: "stats",
    label: "Chiffres clés",
    description: "Ligne de statistiques animées (ex: 500+ élèves, 20 ans d'existence).",
    hasTitle: true,
    hasSubtitle: false,
    content: null,
    settingsFields: [{ key: "label", label: "Sur-titre", kind: "text" }],
    itemFields: [
      { key: "icon", label: "Icône", kind: "icon", options: ICON_OPTIONS },
      { key: "value", label: "Valeur (ex: 500+)", kind: "text" },
      { key: "label", label: "Libellé (ex: Élèves gérés)", kind: "text" },
    ],
    itemLabel: "Statistique",
  },
  {
    type: "gallery",
    label: "Galerie photo",
    description: "Grille d'images.",
    hasTitle: true,
    hasSubtitle: true,
    content: null,
    settingsFields: [{ key: "label", label: "Sur-titre", kind: "text" }],
    itemFields: [
      { key: "url", label: "Image (URL)", kind: "url" },
      { key: "caption", label: "Légende", kind: "text" },
    ],
    itemLabel: "Image",
  },
  {
    type: "cta",
    label: "Appel à l'action",
    description: "Bandeau de fin de page pour inciter à candidater/contacter.",
    hasTitle: true,
    hasSubtitle: false,
    content: { label: "Texte", kind: "textarea" },
    settingsFields: [
      { key: "cta_label", label: "Bouton principal — texte", kind: "text" },
      { key: "cta_url", label: "Bouton principal — lien", kind: "url" },
      { key: "cta_label_2", label: "Bouton secondaire — texte", kind: "text" },
      { key: "cta_url_2", label: "Bouton secondaire — lien", kind: "url" },
    ],
    itemFields: null,
  },
  {
    type: "faq",
    label: "Questions fréquentes",
    description: "Liste de questions/réponses dépliables.",
    hasTitle: true,
    hasSubtitle: true,
    content: null,
    settingsFields: [{ key: "label", label: "Sur-titre", kind: "text" }],
    itemFields: [
      { key: "question", label: "Question", kind: "text" },
      { key: "answer", label: "Réponse", kind: "textarea" },
    ],
    itemLabel: "Question",
  },
  {
    type: "contact_form",
    label: "Formulaire de contact",
    description: "Vrai formulaire (nom, email, téléphone, sujet, message) — les messages envoyés sont reçus dans l'onglet Messages.",
    hasTitle: true,
    hasSubtitle: true,
    content: null,
    settingsFields: [{ key: "label", label: "Sur-titre", kind: "text" }],
    itemFields: null,
  },
  {
    type: "testimonials",
    label: "Témoignages",
    description: "Avis d'élèves, parents ou partenaires.",
    hasTitle: true,
    hasSubtitle: true,
    content: null,
    settingsFields: [{ key: "label", label: "Sur-titre", kind: "text" }],
    itemFields: [
      { key: "name", label: "Nom", kind: "text" },
      { key: "role", label: "Fonction / rôle", kind: "text" },
      { key: "text", label: "Témoignage", kind: "textarea" },
      { key: "avatar", label: "Photo (URL)", kind: "url" },
    ],
    itemLabel: "Témoignage",
  },
  {
    type: "timeline",
    label: "Chronologie",
    description: "Étapes ou dates clés présentées sur une frise verticale.",
    hasTitle: true,
    hasSubtitle: true,
    content: null,
    settingsFields: [{ key: "label", label: "Sur-titre", kind: "text" }],
    itemFields: [
      { key: "date", label: "Date", kind: "text" },
      { key: "title", label: "Titre", kind: "text" },
      { key: "description", label: "Description", kind: "textarea" },
    ],
    itemLabel: "Étape",
  },
  {
    type: "custom_html",
    label: "HTML personnalisé",
    description: "Pour les cas avancés — insère du HTML brut.",
    hasTitle: true,
    hasSubtitle: false,
    content: { label: "HTML", kind: "html" },
    settingsFields: [],
    itemFields: null,
  },
];

export function getSectionTypeConfig(type: string): SectionTypeConfig {
  return SECTION_TYPES.find((t) => t.type === type) || SECTION_TYPES[1]; // fall back to "text"
}

export function emptySection(type: string): PublicPageSection {
  return {
    type,
    title: "",
    subtitle: "",
    content: "",
    items: [],
    settings: {},
  };
}

export function sectionPreviewLabel(section: PublicPageSection): string {
  return section.title || getSectionTypeConfig(section.type).label;
}
