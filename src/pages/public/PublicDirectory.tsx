import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  School,
  MapPin,
  ArrowRight,
  Filter,
  Building2,
  GraduationCap,
  BookOpen,
  Users,
} from "lucide-react";
import { usePublicTenants } from "@/hooks/usePublicTenant";
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
  is_active?: boolean;
  created_at?: string;
  landing?: {
    tagline?: string;
  };
}

type FilterTab = "all" | "university" | "high_school" | "primary_school" | "training_center";
type SortOption = "az" | "recent";

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
// Static fallback data (used when API returns nothing)
// ---------------------------------------------------------------------------

const FALLBACK_TENANTS: PublicTenant[] = [
  {
    id: "1",
    name: "Université La Source",
    slug: "lasource",
    type: "university",
    city: "Lyon",
    country: "France",
    description:
      "Université d'excellence en sciences et technologies, reconnue pour la qualité de ses formations et la recherche appliquée.",
    created_at: "2024-01-15T00:00:00Z",
  },
  {
    id: "2",
    name: "Lycée Montesquieu",
    slug: "lycee-montesquieu",
    type: "high_school",
    city: "Bordeaux",
    country: "France",
    description:
      "Lycée général et technologique offrant un parcours académique complet avec un accompagnement personnalisé de chaque élève.",
    created_at: "2024-02-10T00:00:00Z",
  },
  {
    id: "3",
    name: "Centre AFPA Rennes",
    slug: "afpa-rennes",
    type: "training_center",
    city: "Rennes",
    country: "France",
    description:
      "Centre de formation professionnelle proposant des certifications reconnues dans les secteurs du numérique, du bâtiment et de la santé.",
    created_at: "2024-01-30T00:00:00Z",
  },
  {
    id: "4",
    name: "École Primaire Les Oliviers",
    slug: "ecole-les-oliviers",
    type: "primary_school",
    city: "Marseille",
    country: "France",
    description:
      "École primaire engagée dans une pédagogie innovante favorisant l'épanouissement et la réussite de chaque enfant.",
    created_at: "2024-03-01T00:00:00Z",
  },
  {
    id: "5",
    name: "Institut Supérieur du Commerce",
    slug: "isc-paris",
    type: "university",
    city: "Paris",
    country: "France",
    description:
      "Grande école de commerce reconnue, formant les futurs leaders du monde des affaires avec un réseau alumni international.",
    created_at: "2024-01-05T00:00:00Z",
  },
  {
    id: "6",
    name: "Lycée Technique Jules Verne",
    slug: "lycee-jules-verne",
    type: "high_school",
    city: "Nantes",
    country: "France",
    description:
      "Lycée professionnel et technologique spécialisé dans les métiers de l'industrie, de la robotique et du numérique.",
    created_at: "2024-02-20T00:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InitialsAvatar({ name }: { name: string }) {
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
      className={`w-16 h-16 ${colors[colorIndex]} rounded-2xl flex items-center justify-center text-white text-xl font-bold flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 animate-pulse">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 bg-gray-200 rounded-2xl flex-shrink-0" />
        <div className="flex-1">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-4 bg-gray-100 rounded w-1/2 mb-2" />
          <div className="h-5 bg-gray-100 rounded-full w-24" />
        </div>
      </div>
      <div className="space-y-2 mb-5">
        <div className="h-4 bg-gray-100 rounded w-full" />
        <div className="h-4 bg-gray-100 rounded w-5/6" />
      </div>
      <div className="h-4 bg-gray-100 rounded w-36" />
    </div>
  );
}

function EmptyState({ query, tab }: { query: string; tab: FilterTab }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 bg-blue-50 rounded-2xl flex items-center justify-center mb-6">
        <School className="w-9 h-9 text-blue-300" />
      </div>
      <h3 className="text-lg font-semibold text-gray-700 mb-2">Aucun établissement trouvé</h3>
      <p className="text-gray-400 text-sm max-w-sm">
        {query
          ? `Aucun résultat pour "${query}". Essayez un autre terme ou élargissez vos filtres.`
          : "Aucun établissement dans cette catégorie pour le moment."}
      </p>
    </div>
  );
}

function InstitutionCard({ tenant }: { tenant: PublicTenant }) {
  const navigate = useNavigate();
  const TypeIcon = getTenantTypeIcon(tenant.type);
  const badgeColor = TYPE_BADGE_COLORS[tenant.type ?? "other"] ?? "bg-gray-100 text-gray-700";

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-blue-100 transition-all duration-300 p-6 flex flex-col gap-4 group">
      {/* Header */}
      <div className="flex items-start gap-4">
        {tenant.logo_url ? (
          <img
            src={resolveUploadUrl(tenant.logo_url)}
            alt={tenant.name}
            className="w-16 h-16 rounded-2xl object-cover flex-shrink-0 ring-1 ring-gray-100"
          />
        ) : (
          <InitialsAvatar name={tenant.name} />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-gray-900 text-base leading-snug line-clamp-2 mb-1">
            {tenant.name}
          </h3>
          {/* Location */}
          {(tenant.city || tenant.country) && (
            <p className="flex items-center gap-1 text-gray-400 text-xs mb-2">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              {[tenant.city, tenant.country].filter(Boolean).join(", ")}
            </p>
          )}
          {/* Type badge */}
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${badgeColor}`}
          >
            <TypeIcon className="w-3 h-3" />
            {getTenantTypeLabel(tenant.type)}
          </span>
        </div>
      </div>

      {/* Description */}
      {(tenant.description || tenant.landing?.tagline) && (
        <p className="text-gray-500 text-sm line-clamp-3 leading-relaxed flex-1">
          {tenant.description ?? tenant.landing?.tagline}
        </p>
      )}

      {/* CTA */}
      <button
        onClick={() => navigate(`/ecole/${tenant.slug}`)}
        className="flex items-center gap-2 text-blue-700 font-semibold text-sm group-hover:gap-3 transition-all duration-200 mt-auto"
        aria-label={`Voir l'établissement ${tenant.name}`}
      >
        Voir l&apos;établissement
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const FILTER_TABS: { key: FilterTab; label: string; icon: React.FC<{ className?: string }> }[] = [
  { key: "all", label: "Tous", icon: Building2 },
  { key: "university", label: "Universités", icon: GraduationCap },
  { key: "high_school", label: "Lycées", icon: School },
  { key: "primary_school", label: "Écoles primaires", icon: BookOpen },
  { key: "training_center", label: "Centres de formation", icon: Users },
];

export default function PublicDirectory() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortOption>("az");

  // Load tenants from the sovereign API
  const { data: apiTenants, isLoading } = usePublicTenants();

  const displayTenants = useMemo(() => {
    if (apiTenants && apiTenants.length > 0) {
      return apiTenants;
    }
    return FALLBACK_TENANTS;
  }, [apiTenants]);

  // Filter and sort
  const filtered = useMemo(() => {
    let result = [...displayTenants];

    // Tab filter
    if (activeTab !== "all") {
      result = result.filter((t) => t.type === activeTab);
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.city ?? "").toLowerCase().includes(q) ||
          (t.description ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    if (sort === "az") {
      result.sort((a, b) => a.name.localeCompare(b.name, "fr"));
    } else {
      result.sort(
        (a, b) =>
          new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      );
    }

    return result;
  }, [displayTenants, activeTab, search, sort]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ================================================================ */}
      {/* HEADER                                                           */}
      {/* ================================================================ */}
      <div className="bg-[#1e3a5f] pt-16 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Decorative */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-400 rounded-full opacity-10 blur-3xl translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-400 rounded-full opacity-10 blur-3xl -translate-x-1/2 translate-y-1/2" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <span className="inline-block bg-blue-400/20 text-blue-200 text-xs font-semibold px-3 py-1.5 rounded-full mb-4 uppercase tracking-widest">
            Annuaire
          </span>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight">
            Annuaire des établissements
          </h1>
          <p className="text-blue-200 text-lg max-w-2xl mx-auto">
            Découvrez les établissements scolaires et universitaires qui utilisent SchoolFlow Pro.
            Consultez leur page publique, programmes et informations.
          </p>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SEARCH + FILTERS                                                 */}
      {/* ================================================================ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-4 sm:p-6">
          {/* Search bar */}
          <div className="relative mb-5">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un établissement par nom, ville..."
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
                aria-label="Effacer la recherche"
              >
                &times;
              </button>
            )}
          </div>

          {/* Filter tabs + sort */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Tabs */}
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

            {/* Sort */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Filter className="w-4 h-4 text-gray-400" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="text-sm text-gray-700 bg-gray-100 border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="az">A - Z</option>
                <option value="recent">Plus récents</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* RESULTS COUNT                                                    */}
      {/* ================================================================ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8 mb-4">
        {!isLoading && (
          <p className="text-gray-500 text-sm">
            {filtered.length === 0 ? (
              "Aucun résultat"
            ) : (
              <>
                <span className="font-semibold text-gray-800">{filtered.length}</span>{" "}
                {filtered.length === 1 ? "établissement trouvé" : "établissements trouvés"}
                {search && (
                  <>
                    {" "}pour{" "}
                    <span className="font-medium text-[#1e3a5f]">&ldquo;{search}&rdquo;</span>
                  </>
                )}
              </>
            )}
          </p>
        )}
      </div>

      {/* ================================================================ */}
      {/* GRID                                                             */}
      {/* ================================================================ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          ) : filtered.length === 0 ? (
            <EmptyState query={search} tab={activeTab} />
          ) : (
            filtered.map((tenant) => <InstitutionCard key={tenant.id} tenant={tenant} />)
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* CTA FOOTER                                                       */}
      {/* ================================================================ */}
      <div className="bg-white border-t border-gray-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto text-center flex flex-col items-center gap-5">
          <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center">
            <School className="w-7 h-7 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-[#1e3a5f]">
            Votre établissement n&apos;est pas dans l&apos;annuaire&nbsp;?
          </h2>
          <p className="text-gray-500 text-sm">
            Inscrivez votre établissement gratuitement et rejoignez la communauté SchoolFlow Pro.
          </p>
          <a
            href="/admin/create-tenant"
            className="px-6 py-3 bg-[#1e3a5f] text-white font-semibold rounded-xl hover:bg-[#162d4a] transition-all shadow-md text-sm"
          >
            Inscrire mon établissement
          </a>
        </div>
      </div>
    </div>
  );
}
