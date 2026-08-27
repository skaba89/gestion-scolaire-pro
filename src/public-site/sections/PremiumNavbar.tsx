import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, Menu, UserPlus, X } from "lucide-react";
import { resolveUploadUrl } from "@/utils/url";
import type { DesignTokens } from "../theme/tokens";

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

interface PremiumNavbarProps {
  tenantName: string;
  slug: string;
  logoUrl?: string | null;
  navLinks: NavLink[];
  tokens: DesignTokens;
}

/** Shared, token-styled navbar reused across all site templates —
 * mirrors the sticky-nav + mobile-hamburger pattern already established
 * in every legacy landing template, generalized over design tokens
 * rather than hardcoded per-template colors. */
export function PremiumNavbar({ tenantName, slug, logoUrl, navLinks, tokens }: PremiumNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav
      className="sticky top-0 z-50 bg-white shadow-sm border-b-2"
      style={{ borderBottomColor: tokens.accentColor }}
    >
      <div className="mx-auto px-4 sm:px-6 lg:px-8" style={{ maxWidth: tokens.containerWidth }}>
        <div className="flex items-center justify-between py-3">
          <Link to={`/ecole/${slug}`} className="flex items-center gap-3 min-w-0">
            {logoUrl ? (
              <img src={resolveUploadUrl(logoUrl)} alt={tenantName} className="h-11 w-auto object-contain flex-shrink-0" />
            ) : (
              <div
                className="h-11 w-11 flex items-center justify-center text-white font-bold text-lg flex-shrink-0"
                style={{ backgroundColor: tokens.primaryColor, borderRadius: tokens.buttonRadius }}
              >
                {tenantName.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-bold text-base truncate" style={{ color: tokens.primaryColor, fontFamily: tokens.fontHeading }}>
              {tenantName}
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                style={{ borderRadius: tokens.buttonRadius }}
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="hidden sm:flex items-center gap-2">
            <Link
              to={`/admissions/${slug}`}
              className="px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-sm inline-flex items-center gap-1.5"
              style={{ backgroundColor: tokens.accentColor, borderRadius: tokens.buttonRadius }}
            >
              <UserPlus className="w-4 h-4" />
              Admissions
            </Link>
            <Link
              to={`/${slug}/login`}
              className="px-4 py-2 text-sm font-medium border-2 hover:bg-gray-50 transition-colors inline-flex items-center gap-1.5"
              style={{ color: tokens.primaryColor, borderColor: tokens.primaryColor, borderRadius: tokens.buttonRadius }}
            >
              <LogIn className="w-4 h-4" />
              Connexion
            </Link>
          </div>

          <button
            className="lg:hidden p-2 rounded hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" style={{ color: tokens.primaryColor }} /> : <Menu className="w-5 h-5" style={{ color: tokens.primaryColor }} />}
          </button>
        </div>

        {mobileOpen && (
          <div className="lg:hidden py-4 border-t border-gray-100 space-y-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target={link.external ? "_blank" : undefined}
                rel={link.external ? "noopener noreferrer" : undefined}
                className="block px-4 py-3 rounded text-sm text-gray-700 hover:bg-gray-100"
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-gray-100 space-y-2">
              <Link
                to={`/admissions/${slug}`}
                className="block px-4 py-3 text-sm font-semibold text-white text-center"
                style={{ backgroundColor: tokens.accentColor, borderRadius: tokens.buttonRadius }}
                onClick={() => setMobileOpen(false)}
              >
                Admissions
              </Link>
              <Link
                to={`/${slug}/login`}
                className="block px-4 py-3 text-sm font-medium text-center border-2"
                style={{ color: tokens.primaryColor, borderColor: tokens.primaryColor, borderRadius: tokens.buttonRadius }}
                onClick={() => setMobileOpen(false)}
              >
                Se connecter
              </Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
