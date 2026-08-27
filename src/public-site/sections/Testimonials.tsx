import { Quote } from "lucide-react";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { TestimonialsSectionData } from "../types/sections";

interface TestimonialsProps {
  section: TestimonialsSectionData;
  tokens: DesignTokens;
}

export function Testimonials({ section, tokens }: TestimonialsProps) {
  const items = section.items || [];
  if (items.length === 0) return null;

  return (
    <section
      style={{ backgroundColor: tokens.backgroundColor, paddingTop: tokens.sectionSpacingY, paddingBottom: tokens.sectionSpacingY }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: tokens.containerWidth }}>
        {(section.title || section.subtitle) && (
          <div className="max-w-2xl mx-auto text-center mb-14">
            {section.title && (
              <h2
                className="text-3xl md:text-4xl font-bold mb-4"
                style={{ color: tokens.textColor, fontFamily: tokens.fontHeading }}
              >
                {section.title}
              </h2>
            )}
            {section.subtitle && <p style={{ color: tokens.mutedColor }}>{section.subtitle}</p>}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {items.map((item, i) => (
            <figure
              key={i}
              className="p-6 md:p-8 border relative"
              style={{
                backgroundColor: withAlpha(tokens.primaryColor, 0.03),
                borderColor: withAlpha(tokens.primaryColor, 0.1),
                borderRadius: tokens.borderRadius,
              }}
            >
              <Quote className="w-7 h-7 mb-4" style={{ color: withAlpha(tokens.primaryColor, 0.3) }} />
              <blockquote className="mb-6" style={{ color: tokens.textColor }}>
                "{item.content}"
              </blockquote>
              <figcaption className="flex items-center gap-3">
                {item.avatar_url ? (
                  <img src={item.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" loading="lazy" />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white text-sm"
                    style={{ backgroundColor: tokens.primaryColor }}
                  >
                    {item.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-sm" style={{ color: tokens.textColor }}>{item.name}</p>
                  {item.role && <p className="text-xs" style={{ color: tokens.mutedColor }}>{item.role}</p>}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
