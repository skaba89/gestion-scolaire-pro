// src/pages/public/PublicPageView.tsx
import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { sanitizeHtml } from '@/lib/sanitize';
import {
  Menu,
  X,
  LogIn,
  ChevronRight,
  Star,
  Quote,
  Mail,
  Phone,
  MapPin,
  Globe,
  Facebook,
  Instagram,
  Twitter,
  Youtube,
  Linkedin,
  ArrowRight,
  Clock,
  Send,
  MessageCircle,
  Users,
  Award,
  GraduationCap,
  ChevronDown,
  ExternalLink,
  BookOpen,
  Sparkles,
  Target,
  Eye,
  Heart,
} from 'lucide-react';
import { usePublicTenant } from '@/hooks/usePublicTenant';
import { usePublicPageBySlug, usePublicNav } from '@/hooks/usePublicPages';
import { getLandingSettings } from '@/types/tenant';
import { resolveUploadUrl } from '@/utils/url';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { PublicPageSection } from '@/hooks/usePublicPages';

// ─── Scroll-to-top on navigation ────────────────────────────────────────
function ScrollToTop() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  return null;
}

// ─── Animated counter hook ──────────────────────────────────────────────
function useAnimatedCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const start = performance.now();
          const animate = (now: number) => {
            const elapsed = now - start;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.floor(eased * target));
            if (progress < 1) requestAnimationFrame(animate);
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
}

// ─── Loading Skeleton ───────────────────────────────────────────────────
function PageLoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-6 gap-4">
        <div className="w-10 h-10 rounded-lg bg-gray-200" />
        <div className="w-40 h-5 rounded bg-gray-200" />
        <div className="ml-auto flex gap-3">
          <div className="w-28 h-8 rounded-lg bg-gray-200" />
          <div className="w-20 h-8 rounded-lg bg-gray-200" />
        </div>
      </div>
      <div className="h-80 bg-gray-200" />
      <div className="container mx-auto px-4 py-12 space-y-8">
        <div className="h-8 w-64 rounded bg-gray-200 mx-auto" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 h-48" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 404 Page Not Found ─────────────────────────────────────────────────
function PageNotFound() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-4">
        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl font-bold text-gray-300">404</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">Page introuvable</h1>
        <p className="text-gray-500 mb-8">
          La page que vous cherchez n'existe pas ou a été déplacée.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to={`/${tenantSlug}`}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            Retour à l'accueil
          </Link>
          <Link
            to={`/${tenantSlug}/auth`}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
          >
            <LogIn className="w-4 h-4" />
            Se connecter
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── Navbar Component ───────────────────────────────────────────────────
function PublicNavbar({
  tenantSlug,
  tenantName,
  logoUrl,
  primaryColor,
  navItems,
}: {
  tenantSlug: string;
  tenantName: string;
  logoUrl?: string | null;
  primaryColor: string;
  navItems: { label: string; page_slug?: string | null; url?: string | null; is_external?: boolean }[];
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 bg-white transition-all duration-300 border-b ${
        scrolled ? 'shadow-lg' : 'shadow-sm border-gray-100'
      }`}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo + Name */}
          <Link to={`/${tenantSlug}`} className="flex items-center gap-3 group">
            {logoUrl ? (
              <img
                src={resolveUploadUrl(logoUrl)}
                alt={tenantName}
                className="h-10 md:h-12 w-auto object-contain transition-transform group-hover:scale-105"
              />
            ) : (
              <div
                className="h-10 md:h-12 w-10 md:w-12 rounded-xl flex items-center justify-center text-white transition-transform group-hover:scale-105"
                style={{ backgroundColor: primaryColor }}
              >
                <GraduationCap className="w-6 h-6" />
              </div>
            )}
            <span
              className="hidden sm:block font-bold text-lg leading-tight"
              style={{ color: primaryColor }}
            >
              {tenantName}
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden lg:flex items-center gap-1">
            {navItems.map((item, i) => {
              const href = item.page_slug
                ? `/${tenantSlug}/pages/${item.page_slug}`
                : item.url || '#';

              if (item.is_external || (item.url && !item.page_slug)) {
                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors flex items-center gap-1"
                  >
                    {item.label}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                );
              }

              return (
                <Link
                  key={i}
                  to={href}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* CTA buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to={`/${tenantSlug}/auth`}
              className="px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98]"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="hidden sm:inline-flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                Se connecter
              </span>
              <span className="sm:hidden">
                <LogIn className="w-5 h-5" />
              </span>
            </Link>

            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu dropdown */}
        {mobileOpen && (
          <div className="lg:hidden py-4 border-t border-gray-100 animate-in slide-in-from-top-2 duration-200">
            <div className="space-y-1">
              {navItems.map((item, i) => {
                const href = item.page_slug
                  ? `/${tenantSlug}/pages/${item.page_slug}`
                  : item.url || '#';

                if (item.is_external || (item.url && !item.page_slug)) {
                  return (
                    <a
                      key={i}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-4 py-3 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                      onClick={() => setMobileOpen(false)}
                    >
                      {item.label}
                      <ExternalLink className="w-3.5 h-3.5 text-gray-400" />
                    </a>
                  );
                }

                return (
                  <Link
                    key={i}
                    to={href}
                    className="block px-4 py-3 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                    onClick={() => setMobileOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

// ─── Footer Component ───────────────────────────────────────────────────
function PublicFooter({
  tenantName,
  tenantSlug,
  primaryColor,
  secondaryColor,
  address,
  email,
  phone,
  website,
  settings,
}: {
  tenantName: string;
  tenantSlug: string;
  primaryColor: string;
  secondaryColor: string;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  settings: any;
}) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor || primaryColor} 100%)` }}
    >
      {/* Decorative pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '32px 32px',
          }}
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Main footer */}
        <div className="py-12 md:py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {/* Column 1: Brand */}
          <div className="lg:col-span-1">
            <Link to={`/${tenantSlug}`} className="flex items-center gap-3 mb-4">
              {settings.logo_url ? (
                <img
                  src={resolveUploadUrl(settings.logo_url)}
                  alt={tenantName}
                  className="h-10 w-auto object-contain brightness-0 invert"
                />
              ) : (
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/20">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
              )}
              <span className="text-white font-bold text-lg">{tenantName}</span>
            </Link>
            {settings.tagline && (
              <p className="text-white/60 text-sm leading-relaxed">{settings.tagline}</p>
            )}
          </div>

          {/* Column 2: Contact */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Contact
            </h4>
            <ul className="space-y-3">
              {address && (
                <li className="flex items-start gap-2 text-white/70 text-sm">
                  <MapPin className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{address}</span>
                </li>
              )}
              {email && (
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="flex items-start gap-2 text-white/70 text-sm hover:text-white transition-colors"
                  >
                    <Mail className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{email}</span>
                  </a>
                </li>
              )}
              {phone && (
                <li>
                  <a
                    href={`tel:${phone}`}
                    className="flex items-start gap-2 text-white/70 text-sm hover:text-white transition-colors"
                  >
                    <Phone className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{phone}</span>
                  </a>
                </li>
              )}
              {settings.opening_hours && (
                <li className="flex items-start gap-2 text-white/70 text-sm">
                  <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{settings.opening_hours}</span>
                </li>
              )}
            </ul>
          </div>

          {/* Column 3: Liens rapides */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Liens rapides
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  to={`/${tenantSlug}`}
                  className="text-white/70 text-sm hover:text-white transition-colors"
                >
                  Accueil
                </Link>
              </li>
              <li>
                <Link
                  to={`/${tenantSlug}/auth`}
                  className="text-white/70 text-sm hover:text-white transition-colors"
                >
                  Se connecter
                </Link>
              </li>
              {website && (
                <li>
                  <a
                    href={website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 text-sm hover:text-white transition-colors inline-flex items-center gap-1"
                  >
                    Site officiel
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </li>
              )}
            </ul>
          </div>

          {/* Column 4: Réseaux sociaux */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              Suivez-nous
            </h4>
            <div className="flex gap-3 flex-wrap">
              {settings.facebook && (
                <a
                  href={settings.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <Facebook className="w-5 h-5" />
                </a>
              )}
              {settings.instagram && (
                <a
                  href={settings.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {settings.twitter && (
                <a
                  href={settings.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <Twitter className="w-5 h-5" />
                </a>
              )}
              {settings.youtube && (
                <a
                  href={settings.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <Youtube className="w-5 h-5" />
                </a>
              )}
              {settings.linkedin_url && (
                <a
                  href={settings.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  <Linkedin className="w-5 h-5" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/50">
          <p>© {currentYear} {tenantName}. Tous droits réservés.</p>
          <p>
            La modernité de l'enseignement guinéenne
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Section Renderers ──────────────────────────────────────────────────

function HeroSection({
  section,
  primaryColor,
  secondaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
  secondaryColor: string;
}) {
  const s = section.settings || {};
  return (
    <header
      className="relative min-h-[500px] md:min-h-[600px] flex items-center overflow-hidden"
      style={{
        background: s.background_image
          ? undefined
          : `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor || primaryColor} 100%)`,
      }}
    >
      {s.background_image && (
        <>
          <img
            src={resolveUploadUrl(s.background_image)}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${primaryColor}dd 0%, ${secondaryColor || primaryColor}aa 100%)` }}
          />
        </>
      )}

      {/* Dot pattern overlay */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '40px 40px',
          }}
        />
      </div>

      {/* Decorative circles */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full border border-white/10 hidden lg:block" />
      <div className="absolute top-16 -right-16 w-64 h-64 rounded-full border border-white/10 hidden lg:block" />

      <div className="container mx-auto px-4 sm:px-6 py-24 md:py-36 relative z-10">
        <div className="max-w-4xl">
          {section.title && (
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight animate-in fade-in slide-in-from-bottom-4 duration-700">
              {section.title}
            </h1>
          )}
          {section.subtitle && (
            <p className="text-lg md:text-xl lg:text-2xl text-white/85 mb-8 max-w-2xl leading-relaxed animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150">
              {section.subtitle}
            </p>
          )}
          {section.content && (
            <p className="text-base text-white/70 mb-10 max-w-2xl leading-relaxed animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
              {section.content}
            </p>
          )}

          {/* CTA buttons */}
          {(s.cta_label || s.cta_label_2) && (
            <div className="flex flex-wrap gap-4 animate-in fade-in slide-in-from-bottom-10 duration-700 delay-500">
              {s.cta_label && (
                s.cta_url ? (
                  <a
                    href={s.cta_url}
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold bg-white hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 text-gray-900"
                  >
                    {s.cta_label}
                    <ArrowRight className="w-5 h-5" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold bg-white/20 hover:bg-white/30 backdrop-blur-sm border border-white/30 text-white transition-all">
                    {s.cta_label}
                  </span>
                )
              )}
              {s.cta_label_2 && (
                s.cta_url_2 ? (
                  <a
                    href={s.cta_url_2}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold border-2 border-white/40 text-white hover:bg-white/10 transition-all"
                  >
                    {s.cta_label_2}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold border-2 border-white/40 text-white">
                    {s.cta_label_2}
                  </span>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function TextSection({
  section,
  primaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
}) {
  const s = section.settings || {};
  const bgColor = s.bg_color || (s.dark ? '#1a1a2e' : undefined);
  const textColor = bgColor === '#1a1a2e' || s.dark ? 'white' : undefined;

  return (
    <section
      className="py-16 md:py-24"
      style={{
        backgroundColor: bgColor || (s.gray ? '#f9fafb' : 'white'),
        color: textColor,
      }}
    >
      <div className="container mx-auto px-4 sm:px-6">
        <div className={`max-w-4xl mx-auto ${s.centered ? 'text-center' : ''}`}>
          {section.title && (
            <div className="mb-6">
              {s.label && (
                <p
                  className="text-sm font-semibold uppercase tracking-widest mb-3"
                  style={{ color: textColor ? `${primaryColor}` : primaryColor }}
                >
                  {s.label}
                </p>
              )}
              <h2
                className={`text-3xl md:text-4xl font-bold leading-tight ${
                  textColor === 'white' ? 'text-white' : 'text-gray-900'
                }`}
              >
                {section.title}
              </h2>
              {section.subtitle && (
                <p
                  className={`mt-4 text-lg leading-relaxed ${
                    textColor === 'white' ? 'text-white/70' : 'text-gray-500'
                  }`}
                >
                  {section.subtitle}
                </p>
              )}
            </div>
          )}

          {section.content && (
            <div
              className={`prose prose-lg max-w-none ${
                textColor === 'white' ? 'prose-invert' : ''
              }`}
              style={textColor === 'white' ? { color: 'rgba(255,255,255,0.8)' } : undefined}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.content) }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection({
  section,
  primaryColor,
  secondaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
  secondaryColor: string;
}) {
  const items = section.items || [];
  const s = section.settings || {};
  const columns = s.columns || 3;

  const iconMap: Record<string, React.ReactNode> = {
    book: <BookOpen className="w-6 h-6" />,
    users: <Users className="w-6 h-6" />,
    award: <Award className="w-6 h-6" />,
    star: <Star className="w-6 h-6" />,
    target: <Target className="w-6 h-6" />,
    eye: <Eye className="w-6 h-6" />,
    heart: <Heart className="w-6 h-6" />,
    sparkles: <Sparkles className="w-6 h-6" />,
    globe: <Globe className="w-6 h-6" />,
    graduation: <GraduationCap className="w-6 h-6" />,
    message: <MessageCircle className="w-6 h-6" />,
    clock: <Clock className="w-6 h-6" />,
  };

  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12 md:mb-16">
          {s.label && (
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: primaryColor }}
            >
              {s.label}
            </p>
          )}
          {section.title && (
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-gray-500 text-lg leading-relaxed">{section.subtitle}</p>
          )}
        </div>

        {/* Grid */}
        <div
          className={`grid grid-cols-1 ${
            columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'
          } gap-6 md:gap-8`}
        >
          {items.map((item: any, i: number) => {
            const icon = item.icon ? iconMap[item.icon] || <Sparkles className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />;
            const color = item.color || primaryColor;

            return (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 md:p-8 border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                {icon && (
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${color}15`, color }}
                  >
                    {icon}
                  </div>
                )}
                {item.title && (
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                )}
                {item.description && (
                  <p className="text-gray-500 leading-relaxed text-sm">{item.description}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatsSection({
  section,
  primaryColor,
  secondaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
  secondaryColor: string;
}) {
  const items = section.items || [];
  const s = section.settings || {};

  return (
    <section
      className="py-16 md:py-24 text-white relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor || primaryColor} 100%)` }}
    >
      {/* Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
            backgroundSize: '30px 30px',
          }}
        />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Header */}
        {section.title && (
          <div className="text-center mb-12">
            <p className="text-white/60 text-sm font-semibold uppercase tracking-widest mb-3">
              {s.label || 'En chiffres'}
            </p>
            <h2 className="text-3xl md:text-4xl font-bold">{section.title}</h2>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {items.map((item: any, i: number) => {
            const color = item.color || '#60a5fa';
            const numericValue = typeof item.value === 'number' ? item.value : parseInt(String(item.value).replace(/\D/g, '')) || 0;
            const suffix = typeof item.value === 'string' ? String(item.value).replace(/[\d.,]/g, '') : item.suffix || '';
            const { count, ref } = useAnimatedCounter(numericValue);

            return (
              <div key={i} className="group" ref={ref}>
                {item.icon && (
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 transition-transform group-hover:scale-110"
                    style={{ backgroundColor: `${color}20`, color }}
                  >
                    {item.icon === 'users' && <Users className="w-7 h-7" />}
                    {item.icon === 'award' && <Award className="w-7 h-7" />}
                    {item.icon === 'book' && <BookOpen className="w-7 h-7" />}
                    {item.icon === 'graduation' && <GraduationCap className="w-7 h-7" />}
                    {item.icon === 'star' && <Star className="w-7 h-7" />}
                    {!['users', 'award', 'book', 'graduation', 'star'].includes(item.icon) && (
                      <Target className="w-7 h-7" />
                    )}
                  </div>
                )}
                <p className="text-4xl md:text-5xl font-bold mb-2" style={{ color }}>
                  {count}{suffix}
                </p>
                <p className="text-white/60 text-sm">{item.label}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function GallerySection({ section }: { section: PublicPageSection }) {
  const items = section.items || [];
  const s = section.settings || {};

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-12">
          {s.label && (
            <p className="text-sm font-semibold uppercase tracking-widest mb-3 text-gray-400">
              {s.label}
            </p>
          )}
          {section.title && (
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-gray-500 text-lg">{section.subtitle}</p>
          )}
        </div>

        {items.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {items.map((item: any, i: number) => {
              const imageUrl = typeof item === 'string' ? item : item.url || item.image;
              const caption = typeof item === 'string' ? '' : item.caption || '';
              const isLarge = i === 0;

              return (
                <div
                  key={i}
                  className={`rounded-2xl overflow-hidden bg-gray-100 group ${
                    isLarge ? 'col-span-2 row-span-2' : ''
                  }`}
                  style={{ aspectRatio: isLarge ? '4/3' : '1/1' }}
                >
                  <img
                    src={resolveUploadUrl(imageUrl)}
                    alt={caption || `Image ${i + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function CTASection({
  section,
  primaryColor,
  secondaryColor,
  tenantSlug,
}: {
  section: PublicPageSection;
  primaryColor: string;
  secondaryColor: string;
  tenantSlug: string;
}) {
  const s = section.settings || {};

  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6">
        <div
          className="rounded-3xl overflow-hidden relative"
          style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor || primaryColor} 100%)` }}
        >
          {/* Pattern */}
          <div className="absolute inset-0 opacity-5">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
                backgroundSize: '32px 32px',
              }}
            />
          </div>

          <div className="relative z-10 px-6 py-12 md:px-12 md:py-16 flex flex-col md:flex-row items-center gap-8 md:gap-12">
            <div className="flex-1 text-center md:text-left">
              {section.title && (
                <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">{section.title}</h2>
              )}
              {section.content && (
                <p className="text-white/80 text-lg leading-relaxed">{section.content}</p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
              {s.cta_label && (
                <Link
                  to={s.cta_url || `/${tenantSlug}/auth`}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold bg-white hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                  style={{ color: primaryColor }}
                >
                  {s.cta_label}
                  <ArrowRight className="w-5 h-5" />
                </Link>
              )}
              {s.cta_label_2 && (
                <a
                  href={s.cta_url_2 || '#'}
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold border-2 border-white/40 text-white hover:bg-white/10 transition-all"
                >
                  {s.cta_label_2}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection({
  section,
  primaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
}) {
  const items = section.items || [];
  const s = section.settings || {};

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          {s.label && (
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: primaryColor }}
            >
              {s.label}
            </p>
          )}
          {section.title && (
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-gray-500 text-lg">{section.subtitle}</p>
          )}
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {items.map((item: any, i: number) => (
              <AccordionItem
                key={i}
                value={`faq-${i}`}
                className="bg-gray-50 rounded-xl px-6 border-0 data-[state=open]:bg-white data-[state=open]:shadow-md transition-all"
              >
                <AccordionTrigger className="text-left text-base font-semibold text-gray-900 hover:no-underline">
                  {item.question || item.title}
                </AccordionTrigger>
                <AccordionContent className="text-gray-600 leading-relaxed">
                  {item.answer || item.content || item.description}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function ContactFormSection({
  section,
  primaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
}) {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const s = section.settings || {};

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real implementation, this would POST to an API
    setSubmitted(true);
  };

  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          {s.label && (
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: primaryColor }}
            >
              {s.label}
            </p>
          )}
          {section.title && (
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-gray-500 text-lg">{section.subtitle}</p>
          )}
        </div>

        <div className="max-w-2xl mx-auto">
          {submitted ? (
            <div className="bg-white rounded-2xl p-8 md:p-12 text-center border border-gray-100 shadow-sm">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
                style={{ backgroundColor: `${primaryColor}15` }}
              >
                <Send className="w-8 h-8" style={{ color: primaryColor }} />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Message envoyé !</h3>
              <p className="text-gray-500">
                Merci pour votre message. Nous vous répondrons dans les plus brefs délais.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 md:p-10 border border-gray-100 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Nom complet <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="Votre nom"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    type="email"
                    placeholder="votre@email.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Téléphone
                  </label>
                  <Input
                    type="tel"
                    placeholder="+33 6 00 00 00 00"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Sujet <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    placeholder="Sujet de votre message"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-4 md:mt-5">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Message <span className="text-red-500">*</span>
                </label>
                <Textarea
                  required
                  rows={5}
                  placeholder="Décrivez votre demande..."
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                />
              </div>
              <Button
                type="submit"
                className="w-full mt-6 h-12 text-base font-semibold rounded-xl hover:shadow-lg transition-all"
                style={{ backgroundColor: primaryColor, color: 'white' }}
              >
                <Send className="w-5 h-5" />
                Envoyer le message
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

function TestimonialsSection({
  section,
  primaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
}) {
  const items = section.items || [];
  const s = section.settings || {};

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          {s.label && (
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: primaryColor }}
            >
              {s.label}
            </p>
          )}
          {section.title && (
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-gray-500 text-lg">{section.subtitle}</p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {items.map((item: any, i: number) => {
            const rating = item.rating || 5;

            return (
              <div
                key={i}
                className="bg-gray-50 rounded-2xl p-6 md:p-8 border border-gray-100 hover:shadow-lg transition-all duration-300 relative"
              >
                {/* Quote mark */}
                <Quote
                  className="w-8 h-8 absolute top-6 right-6"
                  style={{ color: `${primaryColor}20` }}
                />

                {/* Stars */}
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star
                      key={j}
                      className={`w-4 h-4 ${
                        j < rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'
                      }`}
                    />
                  ))}
                </div>

                {/* Text */}
                <p className="text-gray-700 leading-relaxed mb-6 text-sm">
                  {item.text || item.content || item.quote}
                </p>

                {/* Author */}
                <div className="flex items-center gap-3">
                  {item.avatar ? (
                    <img
                      src={resolveUploadUrl(item.avatar)}
                      alt={item.name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {(item.name || '?')[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                    {item.role && (
                      <p className="text-gray-500 text-xs">{item.role}</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function TimelineSection({
  section,
  primaryColor,
}: {
  section: PublicPageSection;
  primaryColor: string;
}) {
  const items = section.items || [];
  const s = section.settings || {};

  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          {s.label && (
            <p
              className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: primaryColor }}
            >
              {s.label}
            </p>
          )}
          {section.title && (
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">{section.title}</h2>
          )}
          {section.subtitle && (
            <p className="text-gray-500 text-lg">{section.subtitle}</p>
          )}
        </div>

        <div className="max-w-3xl mx-auto">
          {/* Vertical line */}
          <div className="relative">
            <div
              className="absolute left-4 md:left-1/2 top-0 bottom-0 w-0.5"
              style={{ backgroundColor: `${primaryColor}20` }}
            />

            {items.map((item: any, i: number) => {
              const isLeft = i % 2 === 0;

              return (
                <div
                  key={i}
                  className={`relative flex items-start gap-6 mb-8 md:mb-12 ${
                    isLeft ? 'md:flex-row' : 'md:flex-row-reverse'
                  }`}
                >
                  {/* Dot */}
                  <div
                    className="absolute left-4 md:left-1/2 w-3 h-3 rounded-full -translate-x-1/2 z-10 mt-6"
                    style={{ backgroundColor: primaryColor }}
                  />

                  {/* Content */}
                  <div className={`flex-1 ml-10 md:ml-0 ${isLeft ? 'md:pr-12 md:text-right' : 'md:pl-12'}`}>
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                      {item.date && (
                        <Badge
                          className="mb-3"
                          style={{
                            backgroundColor: `${primaryColor}15`,
                            color: primaryColor,
                            borderColor: 'transparent',
                          }}
                        >
                          {item.date}
                        </Badge>
                      )}
                      {item.title && (
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{item.title}</h3>
                      )}
                      {item.description && (
                        <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Spacer for the other side */}
                  <div className="hidden md:block flex-1" />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function CustomHTMLSection({ section }: { section: PublicPageSection }) {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4 sm:px-6">
        {section.title && (
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center">{section.title}</h2>
        )}
        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(section.content || '') }} />
      </div>
    </section>
  );
}

// ─── Section Router ─────────────────────────────────────────────────────
function RenderSection({
  section,
  primaryColor,
  secondaryColor,
  tenantSlug,
}: {
  section: PublicPageSection;
  primaryColor: string;
  secondaryColor: string;
  tenantSlug: string;
}) {
  switch (section.type) {
    case 'hero':
      return <HeroSection section={section} primaryColor={primaryColor} secondaryColor={secondaryColor} />;
    case 'text':
      return <TextSection section={section} primaryColor={primaryColor} />;
    case 'features':
      return <FeaturesSection section={section} primaryColor={primaryColor} secondaryColor={secondaryColor} />;
    case 'stats':
      return <StatsSection section={section} primaryColor={primaryColor} secondaryColor={secondaryColor} />;
    case 'gallery':
      return <GallerySection section={section} />;
    case 'cta':
      return <CTASection section={section} primaryColor={primaryColor} secondaryColor={secondaryColor} tenantSlug={tenantSlug} />;
    case 'faq':
      return <FAQSection section={section} primaryColor={primaryColor} />;
    case 'contact_form':
      return <ContactFormSection section={section} primaryColor={primaryColor} />;
    case 'testimonials':
      return <TestimonialsSection section={section} primaryColor={primaryColor} />;
    case 'timeline':
      return <TimelineSection section={section} primaryColor={primaryColor} />;
    case 'custom_html':
      return <CustomHTMLSection section={section} />;
    default:
      return <TextSection section={section} primaryColor={primaryColor} />;
  }
}

// ─── Main Page View Component ───────────────────────────────────────────
const PublicPageView = () => {
  const { tenantSlug, pageSlug } = useParams<{ tenantSlug: string; pageSlug: string }>();

  const tenantQuery = usePublicTenant(tenantSlug);
  const navQuery = usePublicNav(tenantSlug);
  const pageQuery = usePublicPageBySlug(tenantSlug, pageSlug);

  const tenant = tenantQuery.data;
  const settings = tenant ? getLandingSettings(tenant) : null;
  const page = pageQuery.data;
  const navItems = navQuery.data || [];

  const isLoading = tenantQuery.isLoading || pageQuery.isLoading;
  const isError = tenantQuery.isError || pageQuery.isError;

  const primaryColor = page?.primary_color || settings?.primary_color || '#1e3a5f';
  const secondaryColor = page?.secondary_color || settings?.secondary_color || '#3b82f6';

  // Scroll to top and set SEO meta
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pageSlug]);

  useEffect(() => {
    if (page) {
      const title = page.meta_title || `${page.title} — ${tenant?.name || 'Établissement'}`;
      document.title = title;

      // Meta description
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.setAttribute('name', 'description');
        document.head.appendChild(metaDesc);
      }
      metaDesc.setAttribute('content', page.meta_description || `${page.title} — ${tenant?.name}`);

      // Theme color
      let themeColor = document.querySelector('meta[name="theme-color"]');
      if (!themeColor) {
        themeColor = document.createElement('meta');
        themeColor.setAttribute('name', 'theme-color');
        document.head.appendChild(themeColor);
      }
      themeColor.setAttribute('content', primaryColor);
    }
  }, [page, tenant, primaryColor]);

  if (isLoading) return <PageLoadingSkeleton />;

  if (isError || !tenant || !page) return <PageNotFound />;

  const sections = page.content || [];

  return (
    <>
      <ScrollToTop />

      <Helmet>
        <title>{page.meta_title || `${page.title} — ${tenant.name}`}</title>
        <meta name="description" content={page.meta_description || `${page.title} — ${tenant.name}`} />
        <meta name="theme-color" content={primaryColor} />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.meta_description || ''} />
        {page.hero_image && <meta property="og:image" content={page.hero_image} />}
      </Helmet>

      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Navbar */}
        <PublicNavbar
          tenantSlug={tenantSlug!}
          tenantName={tenant.name}
          logoUrl={settings?.logo_url}
          primaryColor={primaryColor}
          navItems={navItems}
        />

        {/* Page sections */}
        <main className="flex-1">
          {sections.length > 0 ? (
            sections.map((section, i) => (
              <RenderSection
                key={i}
                section={section}
                primaryColor={primaryColor}
                secondaryColor={secondaryColor}
                tenantSlug={tenantSlug!}
              />
            ))
          ) : (
            <section className="py-24 md:py-32 bg-white">
              <div className="container mx-auto px-4 text-center">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">{page.title}</h2>
                {page.meta_description && (
                  <p className="text-gray-500 text-lg max-w-2xl mx-auto">{page.meta_description}</p>
                )}
              </div>
            </section>
          )}
        </main>

        {/* Footer */}
        <PublicFooter
          tenantName={tenant.name}
          tenantSlug={tenantSlug!}
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          address={tenant.address}
          email={tenant.email || settings?.contact_email}
          phone={tenant.phone || settings?.contact_phone}
          website={tenant.website}
          settings={settings || {}}
        />
      </div>
    </>
  );
};

export default PublicPageView;
