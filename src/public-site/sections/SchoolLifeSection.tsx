import { Sparkles } from "lucide-react";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { SchoolLifeSectionData } from "../types/sections";

interface SchoolLifeSectionProps {
  section: SchoolLifeSectionData;
  tokens: DesignTokens;
}

export function SchoolLifeSection({ section, tokens }: SchoolLifeSectionProps) {
  const items = section.items || [];
  if (items.length === 0) return null;
  const columns = section.settings?.columns && section.settings.columns >= 2 && section.settings.columns <= 4
    ? section.settings.columns
    : 3;
  const colsClass = columns === 2 ? "md:grid-cols-2" : columns === 4 ? "md:grid-cols-4" : "md:grid-cols-3";

  return (
    <section
      style={{
        backgroundColor: withAlpha(tokens.primaryColor, 0.03),
        paddingTop: tokens.sectionSpacingY,
        paddingBottom: tokens.sectionSpacingY,
      }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: tokens.containerWidth }}>
        {(section.title || section.subtitle) && (
          <div className="max-w-2xl mb-10">
            {section.title && (
              <h2
                className="text-3xl md:text-4xl font-bold mb-3"
                style={{ color: tokens.textColor, fontFamily: tokens.fontHeading }}
              >
                {section.title}
              </h2>
            )}
            {section.subtitle && <p style={{ color: tokens.mutedColor }}>{section.subtitle}</p>}
          </div>
        )}
        <div className={`grid grid-cols-1 ${colsClass} gap-6 md:gap-8`}>
          {items.map((item, i) => (
            <div key={i} className="bg-white overflow-hidden border" style={{ borderColor: withAlpha(tokens.primaryColor, 0.08), borderRadius: tokens.borderRadius }}>
              {item.image_url ? (
                <div className="aspect-[16/10] overflow-hidden">
                  <img src={item.image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              ) : (
                <div
                  className="aspect-[16/10] flex items-center justify-center"
                  style={{ backgroundColor: withAlpha(tokens.primaryColor, 0.06) }}
                >
                  <Sparkles className="w-8 h-8" style={{ color: withAlpha(tokens.primaryColor, 0.35) }} />
                </div>
              )}
              <div className="p-5">
                <h3 className="font-bold mb-1.5" style={{ color: tokens.textColor }}>{item.title}</h3>
                {item.description && (
                  <p className="text-sm leading-relaxed" style={{ color: tokens.mutedColor }}>{item.description}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
