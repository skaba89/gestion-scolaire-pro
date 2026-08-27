import type { DesignTokens } from "../../theme/tokens";

/**
 * School Excellence — premium identity for lycée/collège tenants.
 * Deliberately distinct from the legacy HighSchoolTemplate.tsx's
 * hardcoded navy(#1e3a5f)/gold(#c9a227) so choosing this template reads
 * as a genuinely new tier, not a recolor. Deep charcoal-navy + warm
 * bronze, editorial serif headings on a clean sans body, restrained
 * (sharper) radii for an institutional, agency-built feel.
 */
export const schoolExcellenceTokens: DesignTokens = {
  primaryColor: "#12263a",
  secondaryColor: "#3d7a70",
  accentColor: "#b08d57",
  backgroundColor: "#ffffff",
  textColor: "#1a1a1a",
  mutedColor: "#6b7280",
  fontHeading: "Georgia, 'Times New Roman', serif",
  fontBody: "'Inter', system-ui, -apple-system, sans-serif",
  borderRadius: "0.5rem",
  containerWidth: "1280px",
  sectionSpacingY: "6rem",
  buttonRadius: "0.375rem",
  heroOverlayOpacity: 0.6,
  shadowLevel: "md",
};
