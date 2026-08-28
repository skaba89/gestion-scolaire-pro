import type { DesignTokens } from "../../theme/tokens";

/**
 * Primary Bloom — premium identity for école primaire tenants.
 * Deliberately distinct from the legacy PrimarySchoolTemplate.tsx's
 * hardcoded orange(#f97316)/blue(#3b82f6) + emoji-driven design, and from
 * the other two premium templates (School Excellence: charcoal-navy +
 * bronze editorial serif ; Campus Prestige: burgundy + gold pill-shaped).
 * Primary Bloom reads warm and joyful without tipping into childish:
 * terracotta + deep teal, a rounded native sans for headings (no emoji,
 * no external font loading — same convention as the other two premium
 * templates), soft pill buttons, generous rounded corners, lighter
 * shadows and a shorter hero overlay — the whole page should feel
 * welcoming rather than imposing.
 */
export const primaryBloomTokens: DesignTokens = {
  primaryColor: "#d9622f",
  secondaryColor: "#2f7a6b",
  accentColor: "#f2b134",
  backgroundColor: "#fffaf3",
  textColor: "#2b2320",
  mutedColor: "#8a7d6f",
  fontHeading: "'Trebuchet MS', 'Segoe UI', sans-serif",
  fontBody: "'Segoe UI', -apple-system, sans-serif",
  borderRadius: "1.25rem",
  containerWidth: "1200px",
  sectionSpacingY: "5rem",
  buttonRadius: "9999px",
  heroOverlayOpacity: 0.5,
  shadowLevel: "sm",
};
