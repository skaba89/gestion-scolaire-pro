/**
 * Design tokens for the Website Builder premium ("public-site") layer.
 *
 * These are the primitives every shared section component in
 * `src/public-site/sections/` resolves against instead of hardcoding
 * colors/spacing inline. Each site template (School Excellence, and
 * later Campus Prestige / Primary Bloom) ships its own default token
 * set — the SAME section components render differently per template
 * purely by resolving different tokens, which is how we avoid building
 * N near-identical Hero/Stats/CTA components (one per template).
 *
 * This does not replace the existing `style={{ backgroundColor: primaryColor }}`
 * pattern used throughout the legacy templates (UniversityTemplate.tsx etc.)
 * and PublicPageView.tsx's section renderers — it generalizes it. Tokens
 * still resolve to the same plain hex-string/CSS-value primitives those
 * files already consume; there is no CSS-variable indirection introduced
 * here (kept deliberately simple for this first slice).
 */

export interface DesignTokens {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  /** CSS font-family stack, e.g. "'Playfair Display', Georgia, serif" */
  fontHeading: string;
  fontBody: string;
  /** CSS length, e.g. "1rem" — maps to what templates today hardcode as rounded-2xl etc. */
  borderRadius: string;
  /** CSS length, e.g. "1280px" — max content width for centered containers */
  containerWidth: string;
  /** CSS length, e.g. "6rem" — maps to today's hardcoded "py-16 md:py-24" */
  sectionSpacingY: string;
  buttonRadius: string;
  /** 0-1, maps to today's hardcoded hex-alpha overlay suffixes (e.g. "dd"/"aa") on hero banners */
  heroOverlayOpacity: number;
  shadowLevel: "none" | "sm" | "md" | "lg" | "xl";
}

/** Neutral fallback — used only if a template forgets to define its own
 * defaults; no template in this codebase should actually rely on this. */
export const DEFAULT_TOKENS: DesignTokens = {
  primaryColor: "#1e3a5f",
  secondaryColor: "#3b82f6",
  accentColor: "#c9a227",
  backgroundColor: "#ffffff",
  textColor: "#111827",
  mutedColor: "#6b7280",
  fontHeading: "'Inter', system-ui, sans-serif",
  fontBody: "'Inter', system-ui, sans-serif",
  borderRadius: "1rem",
  containerWidth: "1280px",
  sectionSpacingY: "5rem",
  buttonRadius: "0.75rem",
  heroOverlayOpacity: 0.55,
  shadowLevel: "md",
};

const SHADOW_CLASS: Record<DesignTokens["shadowLevel"], string> = {
  none: "shadow-none",
  sm: "shadow-sm",
  md: "shadow-md",
  lg: "shadow-lg",
  xl: "shadow-xl",
};

/** Tailwind doesn't support runtime dynamic values in class names, so
 * shadow level (the one token expressed as a discrete enum rather than a
 * raw CSS value) resolves to a Tailwind class; every other token resolves
 * to a raw style value consumed via `style={{ }}`, exactly like the
 * legacy templates already do for their tenant-driven colors. */
export function shadowClassFor(tokens: DesignTokens): string {
  return SHADOW_CLASS[tokens.shadowLevel];
}

/** Hex color + 0-1 opacity -> 8-digit hex-alpha string, matching the
 * `${color}NN` overlay pattern already used throughout the legacy
 * templates and PublicPageView.tsx (e.g. `${navyColor}12`). */
export function withAlpha(hexColor: string, opacity: number): string {
  const clamped = Math.max(0, Math.min(1, opacity));
  const alphaHex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hexColor}${alphaHex}`;
}
