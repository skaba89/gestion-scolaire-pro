import { Link } from "react-router-dom";
import { Facebook, Linkedin, Twitter } from "lucide-react";
import { resolveUploadUrl } from "@/utils/url";
import type { DesignTokens } from "../theme/tokens";
import type { NavLink } from "./PremiumNavbar";

interface PremiumFooterProps {
  tenantName: string;
  logoUrl?: string | null;
  navLinks: NavLink[];
  facebookUrl?: string | null;
  twitterUrl?: string | null;
  linkedinUrl?: string | null;
  tokens: DesignTokens;
}

export function PremiumFooter({ tenantName, logoUrl, navLinks, facebookUrl, twitterUrl, linkedinUrl, tokens }: PremiumFooterProps) {
  const hasSocial = facebookUrl || twitterUrl || linkedinUrl;

  return (
    <footer style={{ backgroundColor: tokens.primaryColor }} className="text-white mt-16">
      <div className="h-1" style={{ backgroundColor: tokens.accentColor }} />
      <div className="mx-auto px-4 sm:px-6 lg:px-8 py-12" style={{ maxWidth: tokens.containerWidth }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-3">
              {logoUrl ? (
                <img src={resolveUploadUrl(logoUrl)} alt={tenantName} className="h-11 w-auto object-contain" />
              ) : (
                <div
                  className="h-11 w-11 flex items-center justify-center font-bold text-lg"
                  style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: tokens.buttonRadius }}
                >
                  {tenantName.charAt(0).toUpperCase()}
                </div>
              )}
              <p className="font-bold text-lg" style={{ fontFamily: tokens.fontHeading }}>{tenantName}</p>
            </div>
            {hasSocial && (
              <div className="flex gap-2 mt-4">
                {facebookUrl && (
                  <a href={facebookUrl} target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
                    <Facebook className="w-4 h-4" />
                  </a>
                )}
                {twitterUrl && (
                  <a href={twitterUrl} target="_blank" rel="noopener noreferrer" aria-label="Twitter" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
                    <Twitter className="w-4 h-4" />
                  </a>
                )}
                {linkedinUrl && (
                  <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="w-9 h-9 rounded-lg flex items-center justify-center bg-white/10 hover:bg-white/20 transition-colors">
                    <Linkedin className="w-4 h-4" />
                  </a>
                )}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: tokens.accentColor }}>
              Navigation
            </h4>
            <ul className="space-y-2">
              {navLinks.map((link) => (
                <li key={link.label}>
                  {link.external ? (
                    <a href={link.href} target="_blank" rel="noopener noreferrer" className="text-white/60 hover:text-white text-sm transition-colors">
                      {link.label}
                    </a>
                  ) : (
                    <Link to={link.href} className="text-white/60 hover:text-white text-sm transition-colors">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: tokens.accentColor }}>
              Légal
            </h4>
            <ul className="space-y-2">
              <li><Link to="/terms" className="text-white/60 hover:text-white text-sm transition-colors">CGU</Link></li>
              <li><Link to="/privacy" className="text-white/60 hover:text-white text-sm transition-colors">Politique de confidentialité</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 pt-6 text-center">
          <p className="text-white/40 text-sm">© {new Date().getFullYear()} {tenantName}. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}
