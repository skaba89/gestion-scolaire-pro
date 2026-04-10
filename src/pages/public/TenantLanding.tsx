import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePublicTenant, useTenantByDomain } from '@/hooks/usePublicTenant';
import { getLandingSettings } from '@/types/tenant';
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
          L'URL demandée ({window.location.pathname}) ne correspond à aucun établissement enregistré sur SchoolFlow Pro.
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

const TenantLanding = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const customDomain = detectCustomDomain();

  // If on a custom domain, resolve by domain; otherwise resolve by slug from URL
  const slugQuery = usePublicTenant(customDomain ? undefined : tenantSlug);
  const domainQuery = useTenantByDomain(customDomain);

  const { data: tenant, isLoading, isError, error } = customDomain ? domainQuery : slugQuery;

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

export default TenantLanding;
