import { useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { resolveUploadUrl } from "@/utils/url";

interface LegacyHeroBackgroundProps {
  /** Real photos the tenant uploaded (settings.gallery) — 2+ turns this
   * into an auto-playing slideshow. Never fabricated: an empty/short
   * list just falls back to bannerUrl or renders nothing. */
  images?: string[] | null;
  /** Single fallback banner (settings.banner_url) — unchanged prior
   * behavior when there's no gallery to rotate through. */
  bannerUrl?: string | null;
  /** Applied to every image layer — each of the 4 legacy templates has
   * its own opacity/treatment for the hero photo (see each file's own
   * overlay), so this stays template-specific while the carousel
   * mechanics (embla + autoplay + dots) are shared. */
  imageClassName?: string;
  alt: string;
}

/** Shared across the 4 legacy site templates (DefaultLandingTemplate,
 * HighSchoolTemplate, PrimarySchoolTemplate, UniversityTemplate) — none
 * of them had a shared Hero component before (audit 2026-08-28), each
 * duplicated its own <img> markup. Adding hero-carousel support to 4
 * separate copies would be a 5th duplication and a real drift risk
 * (exactly what the audit flagged) — factored here instead, once. Also
 * fixes a real bug found alongside the carousel work: none of the 4
 * templates ever called resolveUploadUrl() on settings.banner_url, so a
 * tenant's own uploaded banner (a relative /uploads/... path) rendered
 * broken on their public site — only an external absolute URL happened
 * to work by coincidence. */
export function LegacyHeroBackground({ images, bannerUrl, imageClassName = "", alt }: LegacyHeroBackgroundProps) {
  const realImages = (images || []).filter(Boolean);

  if (realImages.length > 1) {
    return <LegacyHeroSlideshow images={realImages} imageClassName={imageClassName} alt={alt} />;
  }

  const single = realImages[0] || bannerUrl;
  if (!single) return null;

  return (
    <img
      src={resolveUploadUrl(single)}
      alt={alt}
      className={`absolute inset-0 w-full h-full object-cover ${imageClassName}`}
    />
  );
}

function LegacyHeroSlideshow({ images, imageClassName, alt }: { images: string[]; imageClassName: string; alt: string }) {
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
            <img
              src={resolveUploadUrl(url)}
              alt={alt}
              className={`w-full h-full object-cover ${imageClassName}`}
              loading={i === 0 ? "eager" : "lazy"}
            />
          </div>
        ))}
      </div>
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex gap-2">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => emblaApi?.scrollTo(i)}
            className="rounded-full transition-all"
            style={{
              height: "0.5rem",
              backgroundColor: i === selectedIndex ? "#ffffff" : "rgba(255,255,255,0.4)",
              width: i === selectedIndex ? "1.25rem" : "0.5rem",
            }}
            aria-label={`Aller à la photo ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
