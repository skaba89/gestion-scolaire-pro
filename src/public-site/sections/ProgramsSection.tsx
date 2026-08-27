import { GraduationCap } from "lucide-react";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { ProgramsSectionData } from "../types/sections";

interface ProgramsSectionProps {
  section: ProgramsSectionData;
  tokens: DesignTokens;
}

export function ProgramsSection({ section, tokens }: ProgramsSectionProps) {
  const items = section.items || [];
  if (items.length === 0) return null;

  return (
    <section style={{ paddingTop: tokens.sectionSpacingY, paddingBottom: tokens.sectionSpacingY }}>
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: tokens.containerWidth }}>
        {(section.title || section.subtitle) && (
          <div className="mb-10">
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
          {items.map((item, i) => (
            <div
              key={i}
              className="p-6 border hover:shadow-lg transition-shadow group"
              style={{ borderColor: withAlpha(tokens.primaryColor, 0.1), borderRadius: tokens.borderRadius }}
            >
              <div
                className="w-11 h-11 flex items-center justify-center mb-4"
                style={{ backgroundColor: withAlpha(tokens.primaryColor, 0.1), color: tokens.primaryColor, borderRadius: tokens.buttonRadius }}
              >
                <GraduationCap className="w-5 h-5" />
              </div>
              <h3 className="font-bold mb-1" style={{ color: tokens.textColor }}>{item.name}</h3>
              {item.level && (
                <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: tokens.secondaryColor }}>
                  {item.level}
                </p>
              )}
              {item.description && (
                <p className="text-sm leading-relaxed" style={{ color: tokens.mutedColor }}>{item.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
