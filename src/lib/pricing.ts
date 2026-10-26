/**
 * Grille tarifaire (2026-10-26) — miroir d'affichage de
 * backend/app/services/plan_catalog.py, qui fait autorité.
 *
 * Pas d'offre gratuite : 30 jours d'essai, puis paiement. Toutes les
 * fonctionnalités dans toutes les offres ; seules les limites changent.
 * Prix en euros, payables en GNF au taux du jour (Mobile Money / virement).
 */

export const PLAN_SLUGS = ["standard", "medium", "premium", "enterprise"] as const;
export type PlanSlug = (typeof PLAN_SLUGS)[number];

export const TRIAL_DAYS = 30;

/** Adresse commerciale de l'offre Entreprise (sur devis). */
export const SALES_EMAIL = "contact@academy-guineenne.org";

/** Poids pour le contrôle d'accès : 0 = aucune offre payante. */
export const PLAN_WEIGHT: Record<string, number> = {
  standard: 1,
  medium: 2,
  premium: 3,
  enterprise: 4,
  // anciennes offres payantes, conservées jusqu'à expiration
  pro: 1,
  institution: 4,
};

export const PLAN_LABELS: Record<string, string> = {
  standard: "Standard",
  medium: "Medium",
  premium: "Premium",
  enterprise: "Entreprise",
  free: "Free (ancienne offre)",
  starter: "Starter (ancienne offre)",
  pro: "Pro (ancienne offre)",
  institution: "Institution (ancienne offre)",
};

export interface PublicPlan {
  slug: PlanSlug;
  name: string;
  /** Prix mensuel en euros ; null = sur devis. */
  priceMonthly: number | null;
  priceYearly: number | null;
  students: string;
  description: string;
  highlight: boolean;
}

export const PUBLIC_PLANS: PublicPlan[] = [
  {
    slug: "standard",
    name: "Standard",
    priceMonthly: 49.99,
    priceYearly: 499.9,
    students: "Jusqu'à 500 élèves ou étudiants",
    description: "Pour les écoles et établissements de taille moyenne.",
    highlight: false,
  },
  {
    slug: "medium",
    name: "Medium",
    priceMonthly: 99.99,
    priceYearly: 999.9,
    students: "De 501 à 999 élèves ou étudiants",
    description: "Pour les établissements en croissance.",
    highlight: true,
  },
  {
    slug: "premium",
    name: "Premium",
    priceMonthly: 499.99,
    priceYearly: 4999.9,
    students: "1 000 élèves ou étudiants et plus",
    description: "Pour les grands établissements (un établissement).",
    highlight: false,
  },
  {
    slug: "enterprise",
    name: "Entreprise",
    priceMonthly: null,
    priceYearly: null,
    students: "Plusieurs établissements, effectifs illimités",
    description: "Pour les groupes scolaires, réseaux et universités multi-sites.",
    highlight: false,
  },
];

/** Fonctionnalités incluses dans toutes les offres. */
export const INCLUDED_FEATURES = [
  "Toutes les fonctionnalités incluses",
  "Notes, bulletins et emplois du temps",
  "Portails parents, élèves et enseignants",
  "Assistant IA et import de données",
  "Paiement Mobile Money ou virement",
];

export function formatEur(amount: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(amount);
}

export function hasPlanAccess(plan: string | null | undefined, minPlan: PlanSlug): boolean {
  return (PLAN_WEIGHT[plan ?? ""] ?? 0) >= PLAN_WEIGHT[minPlan];
}
