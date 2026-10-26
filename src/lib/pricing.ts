/**
 * Grille tarifaire (2026-10-26) — miroir d'affichage de
 * backend/app/services/plan_catalog.py, qui fait autorité.
 *
 * Pas d'offre gratuite : 30 jours d'essai, puis paiement. Toutes les
 * fonctionnalités dans toutes les offres ; seules les limites changent.
 * Prix en euros, payables en GNF au taux du jour (Mobile Money / virement).
 * Les textes affichés sont dans les locales (plans.*), pas ici.
 */
import type { TFunction } from "i18next";

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

const LEGACY_SLUGS = ["free", "starter", "pro", "institution"];

/** Libellé traduit d'une offre ; « (ancienne offre) » pour free/starter/pro/institution. */
export function planLabel(t: TFunction, slug: string | null | undefined): string {
  if (!slug) return "";
  if ((PLAN_SLUGS as readonly string[]).includes(slug)) return t(`plans.names.${slug}`);
  if (LEGACY_SLUGS.includes(slug)) return t("plans.legacy", { name: t(`plans.names.${slug}`) });
  return slug;
}

export interface PublicPlan {
  slug: PlanSlug;
  /** Prix mensuel en euros ; null = sur devis. */
  priceMonthly: number | null;
  priceYearly: number | null;
  highlight: boolean;
}

/** Textes : plans.names / plans.students / plans.description.<slug> (locales). */
export const PUBLIC_PLANS: PublicPlan[] = [
  { slug: "standard", priceMonthly: 49.99, priceYearly: 499.9, highlight: false },
  { slug: "medium", priceMonthly: 99.99, priceYearly: 999.9, highlight: true },
  { slug: "premium", priceMonthly: 499.99, priceYearly: 4999.9, highlight: false },
  { slug: "enterprise", priceMonthly: null, priceYearly: null, highlight: false },
];

/** Fonctionnalités incluses dans toutes les offres (clés plans.features.*). */
export const INCLUDED_FEATURE_KEYS = [
  "plans.features.all",
  "plans.features.academics",
  "plans.features.portals",
  "plans.features.aiImport",
  "plans.features.payment",
] as const;

export function formatEur(amount: number, locale = "fr-FR", maximumFractionDigits = 2): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits }).format(amount);
}

export function hasPlanAccess(plan: string | null | undefined, minPlan: PlanSlug): boolean {
  return (PLAN_WEIGHT[plan ?? ""] ?? 0) >= PLAN_WEIGHT[minPlan];
}
