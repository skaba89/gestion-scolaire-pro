import type { CSSProperties } from "react";

interface TenantBrandingColors {
  primary_color?: string | null;
  secondary_color?: string | null;
}

/**
 * Style inline pour l'en-tête d'une page publique, dérivé des couleurs de
 * l'établissement (settings.landing). Volontairement en style inline plutôt
 * que via variables CSS globales : DynamicThemeProvider (App.tsx) réinitialise
 * --primary/--secondary sur les routes publiques non authentifiées (aucun
 * tenant de session), donc une variable CSS globale se ferait écraser. Le
 * style inline gagne toujours sur la classe bg-gradient-hero par défaut.
 */
export function tenantHeroStyle(landing: TenantBrandingColors | undefined | null): CSSProperties | undefined {
  if (!landing?.primary_color) return undefined;
  const end = landing.secondary_color || landing.primary_color;
  return { background: `linear-gradient(135deg, ${landing.primary_color} 0%, ${end} 100%)` };
}
