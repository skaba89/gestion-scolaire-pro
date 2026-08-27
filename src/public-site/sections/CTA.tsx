import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { sanitizeUrl } from "@/lib/sanitize";
import type { DesignTokens } from "../theme/tokens";
import type { CTASectionData } from "../types/sections";

interface CTAProps {
  section: CTASectionData;
  tokens: DesignTokens;
}

function safeHref(url: string | undefined): string | null {
  if (!url) return null;
  const safe = sanitizeUrl(url);
  return safe && safe !== "#" ? safe : null;
}

export function CTA({ section, tokens }: CTAProps) {
  const href = safeHref(section.settings?.cta_url);
  const external = href ? /^https?:\/\//i.test(href) : false;

  return (
    <section
      className="mx-auto px-4 sm:px-6 lg:px-8"
      style={{ maxWidth: tokens.containerWidth, paddingTop: tokens.sectionSpacingY, paddingBottom: tokens.sectionSpacingY }}
    >
      <div
        className="text-center text-white px-6 py-16 md:py-20"
        style={{ backgroundColor: tokens.primaryColor, borderRadius: tokens.borderRadius }}
      >
        {section.title && (
          <h2
            className="text-3xl md:text-4xl font-bold mb-4 max-w-2xl mx-auto"
            style={{ fontFamily: tokens.fontHeading }}
          >
            {section.title}
          </h2>
        )}
        {(section.subtitle || section.content) && (
          <p className="text-white/80 max-w-xl mx-auto mb-8">{section.subtitle || section.content}</p>
        )}
        {href && (
          external ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-8 py-3.5 font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: tokens.accentColor, borderRadius: tokens.buttonRadius }}
            >
              {section.settings?.cta_label || "En savoir plus"}
              <ArrowRight className="w-5 h-5" />
            </a>
          ) : (
            <Link
              to={href}
              className="inline-flex items-center gap-2 px-8 py-3.5 font-semibold text-white shadow-lg hover:opacity-90 transition-opacity"
              style={{ backgroundColor: tokens.accentColor, borderRadius: tokens.buttonRadius }}
            >
              {section.settings?.cta_label || "En savoir plus"}
              <ArrowRight className="w-5 h-5" />
            </Link>
          )
        )}
      </div>
    </section>
  );
}
