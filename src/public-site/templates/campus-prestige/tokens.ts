import type { DesignTokens } from "../../theme/tokens";

/**
 * Campus Prestige — premium identity for université/enseignement
 * supérieur tenants. Deliberately distinct from School Excellence
 * (charcoal-navy + bronze, sharp radii) — deep burgundy + warm gold,
 * pill-shaped buttons and softer, wider containers evoke the "grande
 * université internationale" register the brief asks for, while still
 * resolving to the exact same shared section components.
 */
export const campusPrestigeTokens: DesignTokens = {
  primaryColor: "#4a1023",
  secondaryColor: "#8a6d3b",
  accentColor: "#c9a961",
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  mutedColor: "#6b7280",
  fontHeading: "Cambria, Georgia, serif",
  fontBody: "'Segoe UI', system-ui, -apple-system, sans-serif",
  borderRadius: "0.75rem",
  containerWidth: "1320px",
  sectionSpacingY: "6rem",
  buttonRadius: "9999px",
  heroOverlayOpacity: 0.65,
  shadowLevel: "lg",
};
