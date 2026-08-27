import type { DesignTokens } from "../theme/tokens";
import type { GallerySectionData } from "../types/sections";

interface GalleryProps {
  section: GallerySectionData;
  tokens: DesignTokens;
}

export function Gallery({ section, tokens }: GalleryProps) {
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
          {items.map((item, i) => (
            <figure
              key={i}
              className="overflow-hidden bg-gray-100 group"
              style={{ aspectRatio: "4/3", borderRadius: tokens.borderRadius }}
            >
              <img
                src={item.url}
                alt={item.caption || ""}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
