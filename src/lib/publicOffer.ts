import i18n from "@/i18n/config";

/**
 * Lien de navigation vers la page « Formations et implantations » d'un établissement
 * (`/ecole/:slug/offre`, annuaires publics 2026-11-25), partagé par les 7 modèles d'accueil.
 */
export function publicOfferPath(slug: string): string {
  return `/ecole/${encodeURIComponent(slug)}/offre`;
}

export function publicOfferNavLink(slug: string): { label: string; href: string; external: false } {
  return { label: i18n.t("publicOffer.navLabel"), href: publicOfferPath(slug), external: false };
}
