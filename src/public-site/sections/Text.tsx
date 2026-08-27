import { sanitizeHtml } from "@/lib/sanitize";
import type { DesignTokens } from "../theme/tokens";
import type { TextSectionData } from "../types/sections";

interface TextProps {
  section: TextSectionData;
  tokens: DesignTokens;
}

/** Rich-text presentation block ("présentation" / "qui sommes-nous").
 * Same sanitizeHtml() boundary as PublicPageView.tsx's TextSection —
 * content is admin-authored HTML, never rendered without sanitization. */
export function Text({ section, tokens }: TextProps) {
  if (!section.title && !section.subtitle && !section.content) return null;

  return (
    <section style={{ paddingTop: tokens.sectionSpacingY, paddingBottom: tokens.sectionSpacingY }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: "48rem" }}>
        {section.title && (
          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: tokens.textColor, fontFamily: tokens.fontHeading }}
          >
            {section.title}
          </h2>
        )}
        {section.subtitle && (
          <p className="text-lg mb-6" style={{ color: tokens.mutedColor }}>{section.subtitle}</p>
        )}
        {section.content && (
          <div
            className="prose max-w-none leading-relaxed"
            style={{ color: tokens.textColor }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.content) }}
          />
        )}
      </div>
    </section>
  );
}
