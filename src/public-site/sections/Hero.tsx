import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { sanitizeUrl } from "@/lib/sanitize";
import type { DesignTokens } from "../theme/tokens";
import { withAlpha } from "../theme/tokens";
import type { HeroSectionData } from "../types/sections";

interface HeroProps {
  section: HeroSectionData;
  tokens: DesignTokens;
  /** Falls back to section.settings.background_image when the tenant
   * hasn't set one on the section itself (e.g. tenant banner). */
  fallbackBackgroundImage?: string | null;
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

export function Hero({ section, tokens, fallbackBackgroundImage }: HeroProps) {
  const bg = section.settings?.background_image || fallbackBackgroundImage || undefined;
  const ctaHref = safeHref(section.settings?.cta_url);
  const cta2Href = safeHref(section.settings?.cta_url_2);

  return (
    <header
      className="relative overflow-hidden"
      style={{ backgroundColor: tokens.primaryColor, minHeight: "580px" }}
    >
      {bg && (
        <>
          <img src={bg} alt="" className="absolute inset-0 w-full h-full object-cover" aria-hidden="true" />
          <div
            className="absolute inset-0"
            style={{ backgroundColor: withAlpha("#0a0a0a", tokens.heroOverlayOpacity) }}
          />
        </>
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
