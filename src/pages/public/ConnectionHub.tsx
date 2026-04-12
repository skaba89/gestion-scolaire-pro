import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  School,
  MapPin,
  ArrowRight,
  Building2,
  GraduationCap,
  BookOpen,
  Users,
  LogIn,
  ExternalLink,
  X,
  ChevronRight,
  ShieldCheck,
  Lock,
} from "lucide-react";
import { usePublicTenants } from "@/hooks/usePublicTenant";
import { useAuth } from "@/contexts/AuthContext";
import { resolveUploadUrl } from "@/utils/url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicTenant {
  id: string;
  name: string;
  slug: string;
  type?: string;
  city?: string;
  country?: string;
  description?: string;
  logo_url?: string;
  primary_color?: string;
}

type FilterTab = "all" | "university" | "high_school" | "primary_school" | "training_center";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTenantTypeLabel(type: string | undefined): string {
  const labels: Record<string, string> = {
    university: "Université",
    high_school: "Lycée",
    primary_school: "École primaire",
    training_center: "Centre de formation",
    other: "Autre",
  };
  return type ? (labels[type] ?? type) : "Établissement";
}

function getTenantTypeIcon(type: string | undefined) {
  switch (type) {
    case "university":
      return GraduationCap;
    case "high_school":
      return School;
    case "primary_school":
      return BookOpen;
    case "training_center":
      return Users;
    default:
      return Building2;
  }
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  university: "bg-blue-100 text-blue-800",
  high_school: "bg-purple-100 text-purple-800",
  primary_school: "bg-green-100 text-green-800",
  training_center: "bg-orange-100 text-orange-800",
  other: "bg-gray-100 text-gray-700",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InitialsAvatar({ name, color }: { name: string; color?: string }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-red-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-pink-500",
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;

  return (
    <div
      className={`w-14 h-14 ${color ? "" : colors[colorIndex]} rounded-2xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0`}
      style={color ? { background: color } : undefined}
    >
      {initials}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 animate-pulse">
      <div className="flex items-center gap-4 mb-4">
        <div className="w-14 h-14 bg-gray-200 rounded-2xl flex-shrink-0" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-1/2 mb-2" />
          <div className="h-5 bg-gray-100 rounded-full w-20" />
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded w-full mb-2" />
      <div className="h-3 bg-gray-100 rounded w-5/6 mb-4" />
      <div className="flex gap-2">
        <div className="h-9 bg-gray-100 rounded-lg flex-1" />
        <div className="h-9 bg-gray-100 rounded-lg w-32" />
      </div>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
      <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
        <School className="w-9 h-9 text-blue-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 mb-2">Aucun établissement trouvé</h3>
      <p className="text-gray-400 text-sm max-w-sm">
        {query
          ? `Aucun résultat pour "${query}". Essayez un autre terme de recherche.`
          : "Aucun établissement disponible pour le moment."}
      </p>
    </div>
  );
}

function InstitutionCard({ tenant }: { tenant: PublicTenant }) {
  const TypeIcon = getTenantTypeIcon(tenant.type);
  const badgeColor = TYPE_BADGE_COLORS[tenant.type ?? "other"] ?? "bg-gray-100 text-gray-700";

  const handleViewLogin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const loginUrl = `${window.location.origin}/${tenant.slug}/login`;
    window.open(loginUrl, "_blank", "noopener,noreferrer");
  };

  const handleViewPage = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    window.open(`/${tenant.slug}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-100 transition-all duration-300 p-5 flex flex-col gap-3 group">
      {/* Header */}
      <div className="flex items-center gap-4">
        {tenant.logo_url ? (
          <img
            src={resolveUploadUrl(tenant.logo_url)}
            alt={tenant.name}
            className="w-14 h-14 rounded-2xl object-cover flex-shrink-0 ring-1 ring-gray-100"
          />
        ) : (
          <InitialsAvatar name={tenant.name} color={tenant.primary_color} />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2 mb-1">
            {tenant.name}
          </h3>
          {(tenant.city || tenant.country) && (
            <p className="flex items-center gap-1 text-gray-400 text-xs mb-1.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {[tenant.city, tenant.country].filter(Boolean).join(", ")}
            </p>
          )}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}
          >
            <TypeIcon className="w-3 h-3" />
            {getTenantTypeLabel(tenant.type)}
          </span>
        </div>
      </div>

      {/* Description */}
      {tenant.description && (
        <p className="text-gray-500 text-sm line-clamp-2 leading-relaxed flex-1">
          {tenant.description}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto pt-1">
        <button
          onClick={handleViewLogin}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] transition-all shadow-sm hover:shadow-md"
        >
          <LogIn className="w-4 h-4" />
          Se connecter
        </button>
        <button
          onClick={handleViewPage}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="hidden sm:inline">Page publique</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Access Denied component (shown to non-super-admin users)
// ---------------------------------------------------------------------------

function AccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 bg-red-50 rounded-2xl flex items-center justify-center mx-auto">
          <Lock className="w-9 h-9 text-red-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Accès restreint</h1>
        <p className="text-gray-500 text-sm leading-relaxed">
          Cette page est réservée aux administrateurs de la plateforme.
          Seul le Super Administrateur peut accéder à la liste de tous les établissements.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => navigate("/auth")}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] transition-all shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            Se connecter
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-all"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Retour à l'accueil
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: FilterTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "all", label: "Tous", icon: Building2 },
  { key: "university", label: "Universités", icon: GraduationCap },
  { key: "high_school", label: "Lycées", icon: School },
  { key: "primary_school", label: "Écoles primaires", icon: BookOpen },
  { key: "training_center", label: "Centres de formation", icon: Users },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ConnectionHub() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const { isSuperAdmin, isLoading: authLoading } = useAuth();

  // Load tenants from the public API
  const { data: apiTenants, isLoading } = usePublicTenants();

  // ─── Access Control: Only SUPER_ADMIN can see all establishments ───
  // Wait for auth to finish loading before deciding
  if (!authLoading && !isSuperAdmin()) {
    return <AccessDenied />;
  }

  // Filter
  const filtered = useMemo(() => {
    let result = apiTenants && apiTenants.length > 0 ? [...apiTenants] : [];

    if (activeTab !== "all") {
      result = result.filter((t) => t.type === activeTab);
    }

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.city ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
      );
    }

    // Sort A-Z
    result.sort((a, b) => a.name.localeCompare(b.name, "fr"));

    return result;
  }, [apiTenants, activeTab, search]);

  // Redirect to a tenant login page (used by quick-access buttons)
  const goToLogin = (slug: string) => {
    const loginUrl = `${window.location.origin}/${slug}/login`;
    window.open(loginUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <div className="bg-gradient-to-br from-[#1e3a5f] via-[#1e3a5f] to-[#0f2440] pt-16 pb-24 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Decorative */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400 rounded-full opacity-10 blur-3xl translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400 rounded-full opacity-10 blur-3xl -translate-x-1/2 translate-y-1/2" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500 rounded-full opacity-5 blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          {/* Logo + brand */}
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-white/10 backdrop-blur-sm rounded-2xl flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight">
            Administration des établissements
          </h1>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto leading-relaxed">
            Panneau de gestion de tous les établissements de la plateforme SchoolFlow Pro.
            Accès réservé au Super Administrateur.
          </p>

          {/* Super admin badge */}
          <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 backdrop-blur-sm text-amber-200 text-sm font-medium rounded-full border border-amber-400/30">
            <ShieldCheck className="w-4 h-4" />
            Super Administrateur
          </div>

          {/* Quick action: generic login */}
          <button
            onClick={() => navigate("/auth")}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 backdrop-blur-sm text-white text-sm font-medium rounded-xl border border-white/20 hover:bg-white/20 transition-all"
          >
            <LogIn className="w-4 h-4" />
            Connexion en tant qu'admin
            <ChevronRight className="w-4 h-4 opacity-60" />
          </button>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SEARCH + FILTERS                                                 */}
      {/* ================================================================ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-5 sm:p-6">
          {/* Search bar */}
          <div className="relative mb-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un établissement par nom, ville..."
              className="w-full pl-11 pr-10 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
              autoFocus
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors"
                aria-label="Effacer la recherche"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.key
                      ? "bg-[#1e3a5f] text-white shadow-sm"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* RESULTS INFO                                                     */}
      {/* ================================================================ */}
      {!isLoading && filtered.length > 0 && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 mb-4">
          <p className="text-gray-500 text-sm">
            <span className="font-semibold text-gray-800">{filtered.length}</span>{" "}
            {filtered.length === 1 ? "établissement trouvé" : "établissements trouvés"}
            {search && (
              <>
                {" "}pour{" "}
                <span className="font-medium text-[#1e3a5f]">&ldquo;{search}&rdquo;</span>
              </>
            )}
          </p>
        </div>
      )}

      {/* ================================================================ */}
      {/* GRID                                                             */}
      {/* ================================================================ */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <EmptyState query={search} />
          ) : (
            filtered.map((tenant) => (
              <InstitutionCard key={tenant.id} tenant={tenant as PublicTenant} />
            ))
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* FOOTER                                                           */}
      {/* ================================================================ */}
      {!isLoading && apiTenants && apiTenants.length > 0 && (
        <div className="bg-white border-t border-gray-100 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center flex flex-col items-center gap-5">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
              <ShieldCheck className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-xl font-bold text-[#1e3a5f]">
              Administration plateforme
            </h2>
            <p className="text-gray-500 text-sm max-w-md">
              Vous êtes connecté en tant que Super Administrateur. Vous pouvez gérer tous les établissements
              depuis cette interface.
            </p>
            <button
              onClick={() => navigate("/super-admin")}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] transition-all shadow-sm"
            >
              <ShieldCheck className="w-4 h-4" />
              Accéder au tableau de bord
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* No tenants at all */}
      {!isLoading && apiTenants && apiTenants.length === 0 && (
        <div className="bg-white border-t border-gray-100 py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center flex flex-col items-center gap-5">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
              <Building2 className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-700">
              Aucun établissement enregistré
            </h2>
            <p className="text-gray-500 text-sm max-w-md">
              Aucun établissement n&apos;a encore été configuré sur cette plateforme.
              Revenez plus tard ou contactez-nous pour en savoir plus.
            </p>
            <button
              onClick={() => navigate("/super-admin/create-tenant")}
              className="flex items-center gap-2 text-blue-700 font-semibold text-sm hover:gap-3 transition-all duration-200"
            >
              Créer un établissement
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
