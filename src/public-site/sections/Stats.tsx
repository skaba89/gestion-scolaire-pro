import type { DesignTokens } from "../theme/tokens";
import type { StatsSectionData } from "../types/sections";

interface StatsProps {
  section: StatsSectionData;
  tokens: DesignTokens;
}

/** No fabricated numbers: renders only items actually provided by the
 * tenant/editor (via section.items) — never invents placeholder stats. */
export function Stats({ section, tokens }: StatsProps) {
  const items = section.items || [];
  if (items.length === 0) return null;

  return (
    <section
      className="text-white"
      style={{ backgroundColor: tokens.primaryColor, paddingTop: tokens.sectionSpacingY, paddingBottom: tokens.sectionSpacingY }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: tokens.containerWidth }}>
        {(section.title || section.subtitle) && (
          <div className="text-center mb-12">
            {section.title && (
              <h2 className="text-3xl md:text-4xl font-bold" style={{ fontFamily: tokens.fontHeading }}>
                {section.title}
              </h2>
            )}
            {section.subtitle && <p className="text-white/60 mt-3">{section.subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-10 text-center">
          {items.map((item, i) => (
            <div key={i}>
              <p className="text-4xl md:text-5xl font-bold mb-2" style={{ color: tokens.accentColor }}>
                {item.value}
              </p>
              <p className="text-white/60 text-sm">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
