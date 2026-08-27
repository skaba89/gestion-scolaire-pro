import { CalendarDays, MapPin } from "lucide-react";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { EventsSectionData } from "../types/sections";

interface EventsSectionProps {
  section: EventsSectionData;
  tokens: DesignTokens;
}

export function EventsSection({ section, tokens }: EventsSectionProps) {
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
        <div className="space-y-4">
          {items.map((item, i) => {
            const date = new Date(item.date);
            const validDate = !isNaN(date.getTime());
            return (
              <article
                key={i}
                className="flex gap-5 p-5 border hover:shadow-md transition-shadow"
                style={{ borderColor: withAlpha(tokens.primaryColor, 0.1), borderRadius: tokens.borderRadius }}
              >
                <div
                  className="flex-shrink-0 w-16 h-16 flex flex-col items-center justify-center text-white"
                  style={{ backgroundColor: tokens.primaryColor, borderRadius: tokens.buttonRadius }}
                >
                  {validDate ? (
                    <>
                      <span className="text-xl font-bold leading-none">{date.getDate()}</span>
                      <span className="text-[10px] uppercase mt-1">
                        {date.toLocaleDateString("fr-FR", { month: "short" })}
                      </span>
                    </>
                  ) : (
                    <CalendarDays className="w-6 h-6" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold" style={{ color: tokens.textColor }}>{item.title}</h3>
                  {item.location && (
                    <p className="text-sm flex items-center gap-1 mt-1" style={{ color: tokens.mutedColor }}>
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      {item.location}
                    </p>
                  )}
                  {item.description && (
                    <p className="text-sm mt-2 leading-relaxed" style={{ color: tokens.mutedColor }}>{item.description}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
