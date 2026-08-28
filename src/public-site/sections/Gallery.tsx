import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { resolveUploadUrl } from "@/utils/url";
import type { DesignTokens } from "../theme/tokens";
import type { GallerySectionData } from "../types/sections";

interface GalleryProps {
  section: GallerySectionData;
  tokens: DesignTokens;
}

export function Gallery({ section, tokens }: GalleryProps) {
  const items = section.items || [];
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (items.length === 0) return null;

  const closeLightbox = () => setOpenIndex(null);
  const showPrev = () => setOpenIndex((i) => (i === null ? null : (i - 1 + items.length) % items.length));
  const showNext = () => setOpenIndex((i) => (i === null ? null : (i + 1) % items.length));

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
            <button
              key={i}
              type="button"
              onClick={() => setOpenIndex(i)}
              className="text-left overflow-hidden bg-gray-100 group cursor-zoom-in focus:outline-none focus-visible:ring-2"
              style={{ aspectRatio: "4/3", borderRadius: tokens.borderRadius, ["--tw-ring-color" as string]: tokens.accentColor }}
              aria-label={item.caption ? `Agrandir : ${item.caption}` : `Agrandir la photo ${i + 1}`}
            >
              <img
                src={resolveUploadUrl(item.url)}
                alt={item.caption || ""}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </div>

      {/* Lightbox — plein écran, clic pour agrandir une photo de la galerie */}
      <DialogPrimitive.Root open={openIndex !== null} onOpenChange={(open) => !open && closeLightbox()}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 focus:outline-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogPrimitive.Title className="sr-only">
              {openIndex !== null ? items[openIndex]?.caption || "Photo agrandie" : "Photo agrandie"}
            </DialogPrimitive.Title>
            {openIndex !== null && (
              <>
                <img
                  src={resolveUploadUrl(items[openIndex].url)}
                  alt={items[openIndex].caption || ""}
                  className="max-w-full max-h-full object-contain"
                />
                {items[openIndex].caption && (
                  <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/90 text-sm bg-black/50 px-4 py-2 rounded-full max-w-[90%] text-center">
                    {items[openIndex].caption}
                  </p>
                )}
              </>
            )}
            <DialogPrimitive.Close
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </DialogPrimitive.Close>
            {items.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); showPrev(); }}
                  className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                  aria-label="Photo précédente"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); showNext(); }}
                  className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
                  aria-label="Photo suivante"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </section>
  );
}
