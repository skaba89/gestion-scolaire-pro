import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { sanitizeUrl } from "@/lib/sanitize";
import { resolveUploadUrl } from "@/utils/url";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { HeroSectionData } from "../types/sections";

interface HeroProps {
  section: HeroSectionData;
  tokens: DesignTokens;
  /** Falls back to section.settings.background_image when the tenant
   * hasn't set one on the section itself (e.g. tenant banner). */
  fallbackBackgroundImage?: string | null;
  /** Real photos uploaded by the tenant (settings.gallery) — when there
   * are 2+, the hero becomes an auto-playing carousel instead of a
   * single static background. A single image (or none) keeps the exact
   * previous static-background behavior; never fabricated placeholder
   * images are inserted to "fill out" a carousel. */
  images?: string[];
}

function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  const safe = sanitizeUrl(url);
  return safe && safe !== "#" ? safe : null;
}

/** Renders an internal (`/slug/...`) link as <Link>, external as <a>. */
function CTALink({ href, className, style, children }: {
  href: string; className: string; style?: React.CSSProperties; children: React.ReactNode;
}) {
  const external = /^https?:\/\//i.test(href) || href.startsWith("mailto:") || href.startsWith("tel:");
  if (external) {
    return (
      <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className={className} style={style}>
        {children}
      </a>
    );
  }
  return <Link to={href} className={className} style={style}>{children}</Link>;
}

/** Full-bleed auto-playing background slideshow — internal to Hero, not
 * the generic src/components/ui/carousel.tsx wrapper (that one is built
 * for content galleries with outside-the-box prev/next buttons; a hero
 * background needs the image itself edge-to-edge with controls overlaid
 * on top of it, so it's simpler and clearer as its own small
 * implementation over the same embla-carousel-react primitive). */
function HeroSlideshow({ images }: { images: string[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5500, stopOnInteraction: false, stopOnMouseEnter: true }),
  ]);
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

  return (
    <div className="absolute inset-0 overflow-hidden" ref={emblaRef} aria-hidden="true">
      <div className="flex h-full">
        {images.map((url, i) => (
          <div className="relative min-w-0 shrink-0 grow-0 basis-full h-full" key={i}>
            <img src={resolveUploadUrl(url)} alt="" className="w-full h-full object-cover" loading={i === 0 ? "eager" : "lazy"} />
          </div>
        ))}
      </div>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={() => emblaApi?.scrollPrev()}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            aria-label="Photo précédente"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => emblaApi?.scrollNext()}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-black/30 hover:bg-black/50 text-white flex items-center justify-center transition-colors"
            aria-label="Photo suivante"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
            {images.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => emblaApi?.scrollTo(i)}
                className="w-2 h-2 rounded-full transition-all"
                style={{
                  backgroundColor: i === selectedIndex ? "#ffffff" : "rgba(255,255,255,0.4)",
                  width: i === selectedIndex ? "1.25rem" : "0.5rem",
                }}
                aria-label={`Aller à la photo ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function Hero({ section, tokens, fallbackBackgroundImage, images }: HeroProps) {
  const realImages = (images || []).filter(Boolean);
  const singleBg = section.settings?.background_image || fallbackBackgroundImage || undefined;
  const ctaHref = safeHref(section.settings?.cta_url);
  const cta2Href = safeHref(section.settings?.cta_url_2);

  return (
    <header
      className="relative overflow-hidden"
      style={{ backgroundColor: tokens.primaryColor, minHeight: "580px" }}
    >
      {realImages.length > 1 ? (
        <>
          <HeroSlideshow images={realImages} />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: withAlpha("#0a0a0a", tokens.heroOverlayOpacity) }}
          />
        </>
      ) : (
        (realImages[0] || singleBg) && (
          <>
            <img src={resolveUploadUrl(realImages[0] || singleBg!)} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
            <div
              className="absolute inset-0"
              style={{ backgroundColor: withAlpha("#0a0a0a", tokens.heroOverlayOpacity) }}
            />
          </>
        )
      )}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ backgroundColor: tokens.accentColor }}
      />
      <div
        className="relative z-10 mx-auto px-4 sm:px-6 lg:px-8 py-28 md:py-36"
        style={{ maxWidth: tokens.containerWidth }}
      >
        <div className="max-w-3xl">
          {section.title && (
            <h1
              className="text-4xl sm:text-5xl md:text-6xl font-bold text-white mb-6 leading-[1.05] tracking-tight"
              style={{ fontFamily: tokens.fontHeading }}
            >
              {section.title}
            </h1>
          )}
          {(section.subtitle || section.content) && (
            <p className="text-lg md:text-xl text-white/85 mb-10 max-w-xl leading-relaxed">
              {section.subtitle || section.content}
            </p>
          )}
          {(ctaHref || cta2Href) && (
            <div className="flex flex-wrap gap-4">
              {ctaHref && (
                <CTALink
                  href={ctaHref}
                  className="inline-flex items-center gap-2 px-8 py-3.5 font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: tokens.accentColor, borderRadius: tokens.buttonRadius }}
                >
                  {section.settings?.cta_label || "En savoir plus"}
                  <ArrowRight className="w-5 h-5" />
                </CTALink>
              )}
              {cta2Href && (
                <CTALink
                  href={cta2Href}
                  className="inline-flex items-center gap-2 px-8 py-3.5 font-semibold text-white border-2 border-white/30 hover:bg-white/10 transition-colors"
                  style={{ borderRadius: tokens.buttonRadius }}
                >
                  {section.settings?.cta_label_2 || "Contact"}
                </CTALink>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
