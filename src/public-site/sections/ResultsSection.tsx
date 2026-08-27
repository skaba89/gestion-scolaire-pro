import { Trophy } from "lucide-react";
import type { DesignTokens } from "../theme/tokens";
import type { ResultsSectionData } from "../types/sections";

interface ResultsSectionProps {
  section: ResultsSectionData;
  tokens: DesignTokens;
}

/** No fabricated numbers: renders only real items provided via the
 * editor. `source_note` (when set) is shown so a figure's provenance is
 * never ambiguous to a visitor. */
export function ResultsSection({ section, tokens }: ResultsSectionProps) {
  const items = section.items || [];
  if (items.length === 0) return null;

  return (
    <section style={{ paddingTop: tokens.sectionSpacingY, paddingBottom: tokens.sectionSpacingY }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: tokens.containerWidth }}>
        <div className="flex items-center gap-3 mb-10">
          <Trophy className="w-8 h-8" style={{ color: tokens.accentColor }} />
          <div>
            {section.title && (
              <h2
                className="text-3xl md:text-4xl font-bold"
                style={{ color: tokens.textColor, fontFamily: tokens.fontHeading }}
              >
                {section.title}
              </h2>
            )}
            {section.subtitle && <p style={{ color: tokens.mutedColor }}>{section.subtitle}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center">
          {items.map((item, i) => (
            <div key={i}>
              <p className="text-3xl md:text-4xl font-bold mb-1" style={{ color: tokens.primaryColor }}>
                {item.value}
              </p>
              <p className="text-sm font-medium" style={{ color: tokens.textColor }}>{item.label}</p>
              {item.year && <p className="text-xs mt-0.5" style={{ color: tokens.mutedColor }}>{item.year}</p>}
            </div>
          ))}
        </div>
        {section.settings?.source_note && (
          <p className="text-xs mt-8 text-center" style={{ color: tokens.mutedColor }}>
            {section.settings.source_note}
          </p>
        )}
      </div>
    </section>
  );
}
