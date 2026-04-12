import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, LogIn, ChevronRight, FileText, GraduationCap } from 'lucide-react';
import { usePublicTenant, useTenantByDomain } from '@/hooks/usePublicTenant';
import { usePublicPages } from '@/hooks/usePublicPages';
import { getLandingSettings } from '@/types/tenant';
import { resolveUploadUrl } from '@/utils/url';
import { UniversityTemplate } from './landing/UniversityTemplate';
import { HighSchoolTemplate } from './landing/HighSchoolTemplate';
import { DefaultLandingTemplate } from './landing/DefaultLandingTemplate';
import { PrimarySchoolTemplate } from './landing/PrimarySchoolTemplate';

// Detect custom domain: if hostname is not localhost or the app's own domain, treat it as a custom tenant domain
function detectCustomDomain(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const hostname = window.location.hostname;
  const knownDomains = [
    'localhost',
    '127.0.0.1',
    'schoolflow.pro',
    'app.schoolflow.pro',
    'www.schoolflow.pro',
  ];
  if (knownDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
    return undefined;
  }
  if (hostname.includes('schoolflow')) return undefined;
  return hostname;
}

const UNIVERSITY_TYPES = new Set([
  'UNIVERSITY', 'HIGHER_EDUCATION', 'INSTITUTE', 'BTS', 'IUT',
]);

const HIGH_SCHOOL_TYPES = new Set([
  'HIGH_SCHOOL', 'LYCEE', 'LYCÉE', 'SECONDARY', 'COLLÈGE', 'COLLEGE', 'SECONDARY_SCHOOL'
]);

const PRIMARY_TYPES = new Set([
  'PRIMARY', 'ELEMENTARY',
]);

function selectTemplate(type: string): 'university' | 'highschool' | 'primary' | 'default' {
  const normalized = String(type ?? '').toUpperCase();
  if (UNIVERSITY_TYPES.has(normalized)) return 'university';
  if (HIGH_SCHOOL_TYPES.has(normalized)) return 'highschool';
  if (PRIMARY_TYPES.has(normalized)) return 'primary';
  return 'default';
}

// Loading skeleton
function LandingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50 animate-pulse">
      {/* Navbar skeleton */}
      <div className="h-16 bg-white border-b border-gray-200 flex items-center px-8 gap-4">
        <div className="w-10 h-10 rounded-lg bg-gray-200" />
        <div className="w-48 h-5 rounded bg-gray-200" />
        <div className="ml-auto flex gap-3">
          <div className="w-24 h-8 rounded bg-gray-200" />
          <div className="w-32 h-8 rounded bg-gray-200" />
        </div>
      </div>

      {/* Hero skeleton */}
      <div className="h-96 bg-gray-300 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-300" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5">
          <div className="w-24 h-24 rounded-2xl bg-gray-400 mx-auto" />
          <div className="w-72 h-10 rounded bg-gray-400 mx-auto" />
          <div className="w-96 h-6 rounded bg-gray-400 mx-auto" />
          <div className="flex gap-4 justify-center">
            <div className="w-40 h-12 rounded-xl bg-gray-400" />
            <div className="w-40 h-12 rounded-xl bg-gray-400" />
          </div>
        </div>
      </div>

      {/* Stats skeleton */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <div className="w-12 h-12 rounded-xl bg-gray-200 mb-4" />
              <div className="w-20 h-8 rounded bg-gray-200 mb-2" />
              <div className="w-28 h-4 rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>

      {/* Content skeleton */}
      <div className="container mx-auto px-4 pb-12">
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100">
          <div className="w-48 h-8 rounded bg-gray-200 mb-6" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 rounded-xl bg-gray-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// 404 page
function TenantNotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-4">
        <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-6 shadow-inner">
          <span className="text-5xl font-bold text-gray-300">?</span>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-3">
          Établissement introuvable
        </h1>
        <p className="text-gray-500 mb-8 leading-relaxed">
          L'URL demandée ne correspond à aucun établissement enregistré.
          Vérifiez l'adresse ou revenez à l'accueil.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour à l'accueil
          </Link>
          <Link
            to="/annuaire"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 rounded-xl font-semibold hover:bg-gray-50 transition-colors shadow-sm border border-gray-200"
          >
            Voir l'annuaire
          </Link>
        </div>
      </div>
    </div>
  );
}

// Redirect page shown briefly before sending user to external website
function TenantRedirect({ website, name }: { website: string; name: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md px-4">
        <div className="w-24 h-24 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
          <ExternalLink className="w-10 h-10 text-blue-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {name}
        </h1>
        <p className="text-gray-500 mb-2 leading-relaxed">
          Vous allez être redirigé vers le site officiel de l'établissement.
        </p>
        <p className="text-sm text-blue-600 font-medium mb-6">
          {website}
        </p>
        <a
          href={website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors shadow-sm"
        >
          Accéder au site
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}

const TenantLanding = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const customDomain = detectCustomDomain();
  const effectiveSlug = customDomain ? undefined : tenantSlug;

  // If on a custom domain, resolve by domain; otherwise resolve by slug from URL
  const slugQuery = usePublicTenant(effectiveSlug);
  const domainQuery = useTenantByDomain(customDomain);

  const { data: tenant, isLoading, isError, error } = customDomain ? domainQuery : slugQuery;

  // Fetch public pages (separate query, no blocking)
  const pagesSlug = customDomain ? undefined : tenantSlug;
  const pagesQuery = usePublicPages(pagesSlug);
  const publicPages = pagesQuery.data || [];
  const hasPublicPages = publicPages.length > 0;
  const pagesLoading = pagesQuery.isLoading;

  // Redirect to tenant's external website ONLY if no public pages exist
  useEffect(() => {
    if (tenant?.website && !pagesLoading && !hasPublicPages) {
      window.location.href = tenant.website;
    }
  }, [tenant?.website, pagesLoading, hasPublicPages]);

  if (isLoading) {
    return <LandingSkeleton />;
  }

  // 404: query succeeded but no tenant found, or explicit 404 error
  const is404 =
    isError ||
    !tenant ||
    (error && (error as { response?: { status?: number } })?.response?.status === 404);

  if (is404) {
    return <TenantNotFound />;
  }

  if (!tenant) return <TenantNotFound />;

  const settings = getLandingSettings(tenant);
  const primaryColor = settings.primary_color || '#1e3a5f';

  // If tenant has an external website and NO public pages, redirect
  if (tenant.website && !pagesLoading && !hasPublicPages) {
    return <TenantRedirect website={tenant.website} name={tenant.name} />;
  }

  // If tenant has public pages, show the pages directory
  if (hasPublicPages) {
    const homePage = publicPages.find((p) => p.is_home);
    const otherPages = publicPages.filter((p) => !p.is_home);

    // If there's a home page, redirect to it
    if (homePage) {
      window.location.href = `/${tenantSlug}/pages/${homePage.slug}`;
      return <LandingSkeleton />;
    }

    // Otherwise show a pages directory
    return (
      <TenantPagesDirectory
        tenant={tenant}
        settings={settings}
        primaryColor={primaryColor}
        pages={publicPages}
        tenantSlug={tenantSlug!}
      />
    );
  }

  // Fallback to legacy template-based landing
  const template = selectTemplate(tenant.type);

  switch (template) {
    case 'university':
      return <UniversityTemplate tenant={tenant} settings={settings} />;
    case 'highschool':
      return <HighSchoolTemplate tenant={tenant} settings={settings} />;
    case 'primary':
      return <PrimarySchoolTemplate tenant={tenant} settings={settings} />;
    default:
      return <DefaultLandingTemplate tenant={tenant} settings={settings} />;
  }
};

// Pages directory: shown when tenant has public pages but no home page
function TenantPagesDirectory({
  tenant,
  settings,
  primaryColor,
  pages,
  tenantSlug,
}: {
  tenant: any;
  settings: any;
  primaryColor: string;
  pages: any[];
  tenantSlug: string;
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16 md:h-20">
            <Link to={`/${tenantSlug}`} className="flex items-center gap-3">
              {settings.logo_url ? (
                <img
                  src={resolveUploadUrl(settings.logo_url)}
                  alt={tenant.name}
                  className="h-10 md:h-12 w-auto object-contain"
                />
              ) : (
                <div
                  className="h-10 md:h-12 w-10 md:w-12 rounded-xl flex items-center justify-center text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  <GraduationCap className="w-6 h-6" />
                </div>
              )}
              <span className="font-bold text-lg" style={{ color: primaryColor }}>
                {tenant.name}
              </span>
            </Link>
            <Link
              to={`/${tenantSlug}/auth`}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="inline-flex items-center gap-2">
                <LogIn className="w-4 h-4" />
                Se connecter
              </span>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero banner */}
      <header
        className="relative py-20 md:py-28 overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${primaryColor} 0%, ${settings.secondary_color || primaryColor} 100%)`,
        }}
      >
        <div className="absolute inset-0 opacity-5">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
              backgroundSize: '40px 40px',
            }}
          />
        </div>
        <div className="container mx-auto px-4 sm:px-6 relative z-10 text-center">
          {settings.logo_url ? (
            <img
              src={resolveUploadUrl(settings.logo_url)}
              alt={tenant.name}
              className="h-20 w-auto mx-auto mb-6 object-contain brightness-0 invert"
            />
          ) : (
            <div className="h-20 w-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-white/20">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
          )}
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-4">{tenant.name}</h1>
          {settings.tagline && (
            <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto">{settings.tagline}</p>
          )}
        </div>
      </header>

      {/* Pages grid */}
      <section className="py-12 md:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center mb-3">
              Nos pages
            </h2>
            <p className="text-gray-500 text-center mb-10">
              Explorez les différentes pages de notre établissement
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {pages.map((page: any) => (
                <Link
                  key={page.id}
                  to={`/${tenantSlug}/pages/${page.slug}`}
                  className="group bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  {page.hero_image ? (
                    <div className="h-40 overflow-hidden">
                      <img
                        src={resolveUploadUrl(page.hero_image)}
                        alt={page.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  ) : (
                    <div
                      className="h-40 flex items-center justify-center"
                      style={{ backgroundColor: `${primaryColor}08` }}
                    >
                      <FileText className="w-12 h-12" style={{ color: `${primaryColor}30` }} />
                    </div>
                  )}
                  <div className="p-5">
                    <h3 className="font-bold text-gray-900 text-lg mb-2 group-hover:text-blue-600 transition-colors">
                      {page.title}
                    </h3>
                    {page.meta_description && (
                      <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed">
                        {page.meta_description}
                      </p>
                    )}
                    <div className="mt-4 flex items-center gap-1 text-sm font-semibold" style={{ color: primaryColor }}>
                      Lire la page
                      <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* External website link */}
            {tenant.website && (
              <div className="mt-10 text-center">
                <a
                  href={tenant.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-6 py-3 text-gray-600 hover:text-gray-900 transition-colors font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  Visiter le site officiel
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        className="py-8 text-center text-sm text-gray-400 border-t border-gray-100 bg-white"
      >
        <p>© {new Date().getFullYear()} {tenant.name} — Plateforme de gestion scolaire</p>
      </footer>
    </div>
  );
}

export default TenantLanding;
