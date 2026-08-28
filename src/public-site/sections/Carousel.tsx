import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { resolveUploadUrl } from "@/utils/url";
import type { DesignTokens } from "../theme/tokens";
import type { CarouselSectionData } from "../types/sections";

interface CarouselProps {
  section: CarouselSectionData;
  tokens: DesignTokens;
}

/** Standalone, insertable-anywhere carousel section — same real photos
 * (CarouselItem = {url, caption?}) as the Gallery grid, laid out as
 * auto-advancing slides instead. Distinct from the internal hero
 * slideshow in Hero.tsx/LegacyHeroBackground.tsx (those are full-bleed
 * background images behind text; this is a standalone content block a
 * page composes like any other section — Stats, Gallery, CTA...). */
export function Carousel({ section, tokens }: CarouselProps) {
  const items = section.items || [];
  const autoplay = section.settings?.autoplay !== false;
  const intervalMs = section.settings?.interval_ms || 5000;

  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true },
    autoplay ? [Autoplay({ delay: intervalMs, stopOnInteraction: false, stopOnMouseEnter: true })] : [],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi]);

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

        <div className="relative overflow-hidden" style={{ borderRadius: tokens.borderRadius }} ref={emblaRef}>
          <div className="flex">
            {items.map((item, i) => (
              <div className="relative min-w-0 shrink-0 grow-0 basis-full" key={i} style={{ aspectRatio: "16/9" }}>
                <img
                  src={resolveUploadUrl(item.url)}
                  alt={item.caption || ""}
                  className="w-full h-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                />
                {item.caption && (
                  <p className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-sm px-4 py-2.5">
                    {item.caption}
                  </p>
                )}
              </div>
            ))}
          </div>

          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => emblaApi?.scrollPrev()}
                className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
                aria-label="Photo précédente"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => emblaApi?.scrollNext()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
                aria-label="Photo suivante"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
                {items.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => emblaApi?.scrollTo(i)}
                    className="rounded-full transition-all"
                    style={{
                      height: "0.5rem",
                      backgroundColor: i === selectedIndex ? tokens.accentColor : "rgba(255,255,255,0.5)",
                      width: i === selectedIndex ? "1.25rem" : "0.5rem",
                    }}
                    aria-label={`Aller à la photo ${i + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
