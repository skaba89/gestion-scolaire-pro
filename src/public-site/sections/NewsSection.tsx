import { ArrowUpRight, Newspaper } from "lucide-react";
import { sanitizeUrl } from "@/lib/sanitize";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { NewsSectionData } from "../types/sections";

interface NewsSectionProps {
  section: NewsSectionData;
  tokens: DesignTokens;
}

export function NewsSection({ section, tokens }: NewsSectionProps) {
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {items.map((item, i) => {
            const href = item.link_url ? sanitizeUrl(item.link_url) : null;
            const validHref = href && href !== "#" ? href : null;
            const date = new Date(item.date);
            const validDate = !isNaN(date.getTime());
            const Wrapper = validHref ? "a" : "div";
            return (
              <Wrapper
                key={i}
                {...(validHref ? { href: validHref, target: "_blank", rel: "noopener noreferrer" } : {})}
                className="group block overflow-hidden border hover:shadow-lg transition-shadow"
                style={{ borderColor: withAlpha(tokens.primaryColor, 0.1), borderRadius: tokens.borderRadius }}
              >
                {item.image_url ? (
                  <div className="aspect-[16/9] overflow-hidden">
                    <img src={item.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                  </div>
                ) : (
                  <div className="aspect-[16/9] flex items-center justify-center" style={{ backgroundColor: withAlpha(tokens.primaryColor, 0.06) }}>
                    <Newspaper className="w-8 h-8" style={{ color: withAlpha(tokens.primaryColor, 0.35) }} />
                  </div>
                )}
                <div className="p-5">
                  {validDate && (
                    <time className="text-xs font-medium" style={{ color: tokens.secondaryColor }}>
                      {date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                    </time>
                  )}
                  <h3 className="font-bold mt-1 mb-2 flex items-start justify-between gap-2" style={{ color: tokens.textColor }}>
                    {item.title}
                    {validHref && <ArrowUpRight className="w-4 h-4 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />}
                  </h3>
                  {item.excerpt && (
                    <p className="text-sm leading-relaxed" style={{ color: tokens.mutedColor }}>{item.excerpt}</p>
                  )}
                </div>
              </Wrapper>
            );
          })}
        </div>
      </div>
    </section>
  );
}
