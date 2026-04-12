import { lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
  School,
  Users,
  Globe,
  Shield,
  Smartphone,
  BarChart3,
  CheckCircle,
  Star,
  ArrowRight,
  Zap,
  Menu,
  X,
  ExternalLink,
  LogIn,
} from "lucide-react";
import { useState } from "react";
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
  description?: string;
  logo_url?: string;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const FEATURES = [
  {
    icon: School,
    title: "Multi-tenant",
    description:
      "Chaque établissement dispose de son propre espace isolé, sécurisé et personnalisable, partagé aucune donnée avec d'autres.",
    color: "bg-blue-100 text-blue-700",
  },
  {
    icon: Shield,
    title: "RGPD & Conformité",
    description:
      "Données hébergées en Europe, droit à l'oubli, exports, consentements et audits intégrés nativement dans la plateforme.",
    color: "bg-green-100 text-green-700",
  },
  {
    icon: Smartphone,
    title: "Application mobile",
    description:
      "PWA installable sur Android et iOS. Notifications push, accès hors-ligne et interface optimisée pour les mobiles.",
    color: "bg-purple-100 text-purple-700",
  },
  {
    icon: Globe,
    title: "Multilingue",
    description:
      "Interface disponible en 5 langues : français, anglais, arabe, espagnol et portugais. Changement instantané par utilisateur.",
    color: "bg-orange-100 text-orange-700",
  },
  {
    icon: BarChart3,
    title: "Analytics avancés",
    description:
      "Tableaux de bord temps réel, indicateurs clés, prédictions IA sur les risques académiques et exports personnalisés.",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    icon: Zap,
    title: "PWA & Offline",
    description:
      "Consultez bulletins, absences et emplois du temps même sans connexion internet grâce au cache intelligent.",
    color: "bg-yellow-100 text-yellow-700",
  },
];

const STATS = [
  { value: "500+", label: "Élèves gérés" },
  { value: "4", label: "Langues supportées" },
  { value: "99.9%", label: "Disponibilité" },
  { value: "RGPD", label: "Conforme" },
];

const SAMPLE_SCHOOLS: PublicTenant[] = [
  {
    id: "1",
    name: "Université La Source",
    slug: "lasource",
    type: "university",
    city: "Lyon",
    description: "Une université d'excellence au cœur de Lyon, spécialisée en sciences et technologies.",
    logo_url: undefined,
  },
  {
    id: "2",
    name: "Lycée Montesquieu",
    slug: "lycee-montesquieu",
    type: "high_school",
    city: "Bordeaux",
    description: "Lycée général et technologique proposant des filières innovantes et un accompagnement personnalisé.",
    logo_url: undefined,
  },
  {
    id: "3",
    name: "Centre AFPA Rennes",
    slug: "afpa-rennes",
    type: "training_center",
    city: "Rennes",
    description: "Centre de formation professionnelle avec des certifications reconnues dans tous les secteurs.",
    logo_url: undefined,
  },
];

const PRICING = [
  {
    tier: "Starter",
    price: "Gratuit",
    period: "",
    description: "Pour les petits établissements qui débutent",
    features: ["Jusqu'à 20 élèves", "Modules de base", "Support email", "1 administrateur"],
    cta: "Commencer gratuitement",
    highlight: false,
  },
  {
    tier: "Pro 500",
    price: "500€",
    period: "/ mois",
    description: "Pour les établissements en croissance",
    features: [
      "Jusqu'à 500 élèves",
      "Tous les modules",
      "Analytics avancés",
      "Support prioritaire",
    ],
    cta: "Choisir Pro 500",
    highlight: false,
  },
  {
    tier: "Pro 1000",
    price: "800€",
    period: "/ mois",
    description: "Pour les grandes structures",
    features: [
      "Jusqu'à 1000 élèves",
      "Analytics prédictifs",
      "Support dédié",
      "API complète",
    ],
    cta: "Essayer Pro 1000",
    highlight: true,
  },
  {
    tier: "Enterprise",
    price: "1500€",
    period: "/ mois",
    description: "Pour les réseaux et groupes scolaires",
    features: [
      "Multi-établissements",
      "SLA garanti",
      "Déploiement on-premise",
      "Formation incluse",
    ],
    cta: "Nous contacter",
    highlight: false,
  },
];

const TESTIMONIALS = [
  {
    name: "Dr. Marie Leclerc",
    role: "Directrice, Institut Polytechnique",
    content:
      "SchoolFlow Pro a transformé notre gestion administrative. Nous économisons 15h par semaine sur les tâches répétitives.",
    rating: 5,
  },
  {
    name: "Thomas Renard",
    role: "Proviseur, Lycée Jean Moulin",
    content:
      "La conformité RGPD était notre plus grand défi. Avec SchoolFlow, tout est géré nativement. Un vrai soulagement.",
    rating: 5,
  },
  {
    name: "Fatou Diallo",
    role: "Responsable pédagogique, CFPB",
    content:
      "L'application mobile est parfaite pour nos apprenants. Les parents reçoivent les notifications en temps réel.",
    rating: 5,
  },
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InitialsAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-12 h-12 text-sm",
    lg: "w-16 h-16 text-lg",
  };

  const colors = [
    "bg-blue-500",
    "bg-purple-500",
    "bg-green-500",
    "bg-orange-500",
    "bg-red-500",
    "bg-indigo-500",
  ];
  const colorIndex = name.charCodeAt(0) % colors.length;

  return (
    <div
      className={`${sizeClasses[size]} ${colors[colorIndex]} rounded-full flex items-center justify-center text-white font-bold flex-shrink-0`}
    >
      {initials}
    </div>
  );
}

function SchoolCard({ school }: { school: PublicTenant }) {
  const navigate = useNavigate();
  const typeLabels: Record<string, string> = {
    university: "Université",
    high_school: "Lycée",
    primary_school: "École primaire",
    training_center: "Centre de formation",
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-300 p-6 flex flex-col gap-4">
      <div className="flex items-start gap-4">
        {school.logo_url ? (
          <img src={resolveUploadUrl(school.logo_url)} alt={school.name} className="w-14 h-14 rounded-xl object-cover" />
        ) : (
          <InitialsAvatar name={school.name} size="lg" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-lg leading-tight truncate">{school.name}</h3>
          {school.city && <p className="text-gray-500 text-sm mt-0.5">{school.city}</p>}
          {school.type && (
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
              {typeLabels[school.type] ?? school.type}
            </span>
          )}
        </div>
      </div>
      {school.description && (
        <p className="text-gray-600 text-sm line-clamp-2 flex-1">{school.description}</p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => window.open(`${window.location.origin}/${school.slug}/login`, "_blank", "noopener,noreferrer")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-semibold rounded-xl hover:bg-[#162d4a] transition-all shadow-sm"
        >
          <LogIn className="w-4 h-4" />
          Se connecter
        </button>
        <button
          onClick={() => navigate(`/ecole/${school.slug}`)}
          className="flex items-center gap-2 text-blue-700 font-medium text-sm hover:gap-3 transition-all duration-200 group"
        >
          <ExternalLink className="w-4 h-4" />
          <span className="hidden sm:inline">Détails</span>
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hero SVG illustration
// ---------------------------------------------------------------------------

function HeroIllustration() {
  return (
    <div className="relative w-full max-w-lg mx-auto">
      <svg viewBox="0 0 480 380" className="w-full h-auto drop-shadow-xl" aria-hidden="true">
        {/* Background card */}
        <rect x="20" y="20" width="440" height="340" rx="24" fill="#1e3a5f" opacity="0.05" />

        {/* Main dashboard card */}
        <rect x="40" y="40" width="400" height="300" rx="20" fill="white" />
        <rect x="40" y="40" width="400" height="52" rx="20" fill="#1e3a5f" />
        <rect x="40" y="72" width="400" height="20" fill="#1e3a5f" />

        {/* Dots */}
        <circle cx="68" cy="64" r="6" fill="#ef4444" />
        <circle cx="88" cy="64" r="6" fill="#f59e0b" />
        <circle cx="108" cy="64" r="6" fill="#22c55e" />

        {/* Title bar text placeholder */}
        <rect x="200" y="60" width="100" height="8" rx="4" fill="white" opacity="0.5" />

        {/* Stats row */}
        <rect x="64" y="112" width="90" height="56" rx="12" fill="#eff6ff" />
        <rect x="72" y="120" width="36" height="6" rx="3" fill="#3b82f6" />
        <rect x="72" y="130" width="60" height="10" rx="5" fill="#1e3a5f" />
        <rect x="72" y="146" width="48" height="6" rx="3" fill="#94a3b8" />

        <rect x="170" y="112" width="90" height="56" rx="12" fill="#f0fdf4" />
        <rect x="178" y="120" width="36" height="6" rx="3" fill="#22c55e" />
        <rect x="178" y="130" width="60" height="10" rx="5" fill="#166534" />
        <rect x="178" y="146" width="48" height="6" rx="3" fill="#94a3b8" />

        <rect x="276" y="112" width="90" height="56" rx="12" fill="#faf5ff" />
        <rect x="284" y="120" width="36" height="6" rx="3" fill="#a855f7" />
        <rect x="284" y="130" width="60" height="10" rx="5" fill="#581c87" />
        <rect x="284" y="146" width="48" height="6" rx="3" fill="#94a3b8" />

        {/* Chart area */}
        <rect x="64" y="184" width="302" height="100" rx="12" fill="#f8fafc" />
        <polyline
          points="80,264 110,240 140,248 170,220 200,228 230,200 260,212 290,192 320,204 350,180"
          fill="none"
          stroke="#3b82f6"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="80,264 110,240 140,248 170,220 200,228 230,200 260,212 290,192 320,204 350,180 350,280 80,280"
          fill="#3b82f6"
          opacity="0.08"
        />
        {/* Chart dots */}
        {[
          [80, 264],
          [110, 240],
          [140, 248],
          [170, 220],
          [200, 228],
          [230, 200],
          [260, 212],
          [290, 192],
          [320, 204],
          [350, 180],
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="4" fill="#3b82f6" />
        ))}

        {/* Floating badge: RGPD */}
        <rect x="340" y="170" width="80" height="36" rx="10" fill="#22c55e" />
        <text x="380" y="193" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">
          RGPD ✓
        </text>

        {/* Floating user avatars */}
        <circle cx="380" cy="130" r="16" fill="#f97316" />
        <text x="380" y="135" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">
          ML
        </text>
        <circle cx="408" cy="130" r="16" fill="#8b5cf6" />
        <text x="408" y="135" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">
          JD
        </text>
        <circle cx="356" cy="130" r="16" fill="#06b6d4" />
        <text x="356" y="135" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">
          SA
        </text>
      </svg>

      {/* Decorative blobs */}
      <div className="absolute -top-8 -right-8 w-32 h-32 bg-blue-400 rounded-full opacity-10 blur-2xl pointer-events-none" />
      <div className="absolute -bottom-8 -left-8 w-40 h-40 bg-indigo-400 rounded-full opacity-10 blur-2xl pointer-events-none" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SchoolFlowHomePage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // We attempt to import usePublicTenants if available; fall back to sample data
  // Since the hook doesn't exist yet, we use static data for the establishments section
  const publicTenants: PublicTenant[] = SAMPLE_SCHOOLS;

  const navLinks = [
    { label: "Fonctionnalités", href: "#fonctionnalites" },
    { label: "Tarifs", href: "#tarifs" },
    { label: "Annuaire", href: "/annuaire" },
  ];

  const handleNavClick = (href: string) => {
    setMobileMenuOpen(false);
    if (href.startsWith("/")) {
      navigate(href);
    } else {
      const el = document.querySelector(href);
      el?.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* ================================================================ */}
      {/* NAVBAR                                                           */}
      {/* ================================================================ */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-2.5 group"
            >
              <div className="w-8 h-8 bg-[#1e3a5f] rounded-lg flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow">
                <School className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-[#1e3a5f] text-lg tracking-tight">
                SchoolFlow <span className="text-blue-600">Pro</span>
              </span>
            </button>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => handleNavClick(link.href)}
                  className="px-4 py-2 text-gray-600 hover:text-[#1e3a5f] font-medium text-sm rounded-lg hover:bg-gray-50 transition-all"
                >
                  {link.label}
                </button>
              ))}
              <button
                onClick={() => window.open('/connexion', '_blank', 'noopener,noreferrer')}
                className="ml-2 px-4 py-2 text-[#1e3a5f] font-medium text-sm rounded-lg hover:bg-blue-50 transition-all flex items-center gap-1.5"
              >
                Se connecter
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => navigate("/admin/create-tenant")}
                className="ml-2 px-4 py-2 bg-[#1e3a5f] text-white font-semibold text-sm rounded-lg hover:bg-[#162d4a] transition-all shadow-sm"
              >
                Créer mon établissement
              </button>
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-3 border-t border-gray-100 flex flex-col gap-1">
              {navLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => handleNavClick(link.href)}
                  className="text-left px-4 py-2.5 text-gray-700 hover:text-[#1e3a5f] font-medium text-sm rounded-lg hover:bg-gray-50 transition-all"
                >
                  {link.label}
                </button>
              ))}
              <button
                onClick={() => { setMobileMenuOpen(false); window.open('/connexion', '_blank', 'noopener,noreferrer'); }}
                className="text-left px-4 py-2.5 text-gray-700 font-medium text-sm flex items-center gap-2"
              >
                Se connecter
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => { setMobileMenuOpen(false); navigate("/admin/create-tenant"); }}
                className="mx-4 mt-1 py-2.5 bg-[#1e3a5f] text-white font-semibold text-sm rounded-lg text-center"
              >
                Créer mon établissement
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ================================================================ */}
      {/* HERO                                                             */}
      {/* ================================================================ */}
      <section className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 overflow-hidden">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Copy */}
          <div className="flex flex-col gap-8">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1.5 rounded-full w-fit">
              <Zap className="w-3.5 h-3.5" />
              Plateforme SaaS tout-en-un
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#1e3a5f] leading-tight tracking-tight">
              La plateforme{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                tout-en-un
              </span>{" "}
              pour gérer votre établissement
            </h1>

            <p className="text-lg text-gray-600 leading-relaxed max-w-xl">
              Admissions, notes, présences, finances, RGPD, analytics — tout ce dont votre école,
              université ou centre de formation a besoin, dans une seule solution sécurisée et
              conforme.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => window.open("/connexion", "_blank", "noopener,noreferrer")}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-[#1e3a5f] text-white font-semibold rounded-xl hover:bg-[#162d4a] transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform"
              >
                <ExternalLink className="w-4 h-4" />
                Se connecter
              </button>
              <button
                onClick={() => navigate("/annuaire")}
                className="flex items-center justify-center gap-2 px-6 py-3.5 bg-white text-[#1e3a5f] font-semibold rounded-xl border-2 border-[#1e3a5f]/20 hover:border-[#1e3a5f]/40 transition-all"
              >
                Voir les établissements
                <School className="w-4 h-4" />
              </button>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap gap-4 pt-2">
              {["RGPD conforme", "Hébergé en Europe", "Support 24h/7j"].map((badge) => (
                <div key={badge} className="flex items-center gap-1.5 text-gray-500 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  {badge}
                </div>
              ))}
            </div>
          </div>

          {/* Illustration */}
          <div className="flex justify-center lg:justify-end">
            <HeroIllustration />
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* STATS BAR                                                        */}
      {/* ================================================================ */}
      <section className="bg-[#1e3a5f] py-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl sm:text-4xl font-extrabold text-white">{stat.value}</div>
                <div className="text-blue-200 text-sm mt-1 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FEATURES GRID                                                    */}
      {/* ================================================================ */}
      <section id="fonctionnalites" className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">
              Fonctionnalités
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1e3a5f] mb-4">
              Tout ce dont votre établissement a besoin
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Une suite complète de modules pensés pour les besoins réels des établissements
              scolaires et universitaires modernes.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group p-7 bg-gray-50 rounded-2xl border border-gray-100 hover:bg-white hover:border-blue-100 hover:shadow-lg transition-all duration-300"
                >
                  <div className={`w-11 h-11 rounded-xl ${feature.color} flex items-center justify-center mb-5`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-[#1e3a5f] text-lg mb-2">{feature.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* TESTIMONIALS                                                     */}
      {/* ================================================================ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">
              Témoignages
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1e3a5f] mb-4">
              Ce que disent nos utilisateurs
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="bg-white rounded-2xl p-7 shadow-sm border border-gray-100 flex flex-col gap-4">
                <div className="flex gap-1">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed italic flex-1">
                  &ldquo;{t.content}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <InitialsAvatar name={t.name} size="sm" />
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{t.name}</p>
                    <p className="text-gray-400 text-xs">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* ETABLISSEMENTS (public tenants)                                  */}
      {/* ================================================================ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-12">
            <div>
              <span className="inline-block text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">
                Annuaire
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1e3a5f]">
                Nos établissements
              </h2>
              <p className="text-gray-500 mt-2">
                Des établissements qui nous font confiance chaque jour.
              </p>
            </div>
            <button
              onClick={() => navigate("/annuaire")}
              className="flex items-center gap-2 text-blue-700 font-semibold text-sm hover:gap-3 transition-all duration-200 group whitespace-nowrap"
            >
              Voir tous les établissements
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {publicTenants.map((school) => (
              <SchoolCard key={school.id} school={school} />
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* PRICING                                                          */}
      {/* ================================================================ */}
      <section id="tarifs" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="inline-block text-blue-600 font-semibold text-sm uppercase tracking-widest mb-3">
              Tarifs
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#1e3a5f] mb-4">
              Des offres pour chaque taille d&apos;établissement
            </h2>
            <p className="text-gray-500 text-lg max-w-xl mx-auto">
              Commencez gratuitement et évoluez selon vos besoins. Pas de frais cachés.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
            {PRICING.map((plan) => (
              <div
                key={plan.tier}
                className={`rounded-2xl p-8 flex flex-col gap-6 transition-all ${
                  plan.highlight
                    ? "bg-[#1e3a5f] text-white shadow-2xl ring-4 ring-blue-200 scale-105"
                    : "bg-white border border-gray-100 shadow-sm hover:shadow-md"
                }`}
              >
                {plan.highlight && (
                  <div className="text-center">
                    <span className="bg-blue-400/30 text-blue-100 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                      Plus populaire
                    </span>
                  </div>
                )}
                <div>
                  <h3 className={`font-bold text-xl ${plan.highlight ? "text-white" : "text-[#1e3a5f]"}`}>
                    {plan.tier}
                  </h3>
                  <p className={`text-sm mt-1 ${plan.highlight ? "text-blue-200" : "text-gray-500"}`}>
                    {plan.description}
                  </p>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-4xl font-extrabold ${plan.highlight ? "text-white" : "text-[#1e3a5f]"}`}>
                    {plan.price}
                  </span>
                  {plan.period && (
                    <span className={`text-sm ${plan.highlight ? "text-blue-200" : "text-gray-400"}`}>
                      {plan.period}
                    </span>
                  )}
                </div>
                <ul className="flex flex-col gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2.5 text-sm">
                      <CheckCircle
                        className={`w-4 h-4 flex-shrink-0 ${plan.highlight ? "text-blue-300" : "text-green-500"}`}
                      />
                      <span className={plan.highlight ? "text-blue-100" : "text-gray-600"}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => navigate(plan.tier === "Enterprise" ? "/contact" : "/admin/create-tenant")}
                  className={`w-full py-3 rounded-xl font-semibold text-sm transition-all ${
                    plan.highlight
                      ? "bg-white text-[#1e3a5f] hover:bg-blue-50"
                      : "bg-[#1e3a5f] text-white hover:bg-[#162d4a]"
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FINAL CTA                                                        */}
      {/* ================================================================ */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#1e3a5f] relative overflow-hidden">
        {/* Decorative blobs */}
        <div className="absolute top-0 left-0 w-64 h-64 bg-blue-400 rounded-full opacity-10 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-400 rounded-full opacity-10 blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none" />

        <div className="max-w-3xl mx-auto text-center relative z-10 flex flex-col items-center gap-8">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight">
            Prêt à moderniser votre établissement&nbsp;?
          </h2>
          <p className="text-blue-200 text-lg max-w-xl leading-relaxed">
            Rejoignez les établissements qui font confiance à SchoolFlow Pro. Déployez en 10 minutes,
            sans engagement, sans carte bancaire.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <button
              onClick={() => navigate("/admin/create-tenant")}
              className="px-8 py-4 bg-white text-[#1e3a5f] font-bold rounded-xl hover:bg-blue-50 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 transform text-base"
            >
              Créer mon établissement gratuitement
            </button>
            <button
              onClick={() => navigate("/ecole/lasource")}
              className="px-8 py-4 border-2 border-white/30 text-white font-semibold rounded-xl hover:border-white/60 transition-all text-base"
            >
              Voir la démo
            </button>
          </div>
          <p className="text-blue-300 text-sm">
            Aucune carte de crédit requise &bull; Données hébergées en France &bull; RGPD conforme
          </p>
        </div>
      </section>

      {/* ================================================================ */}
      {/* FOOTER                                                           */}
      {/* ================================================================ */}
      <footer className="bg-gray-900 text-gray-400 py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
            {/* Brand */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <School className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-white text-base">SchoolFlow Pro</span>
              </div>
              <p className="text-sm leading-relaxed">
                La plateforme SaaS tout-en-un pour les établissements scolaires et universitaires.
              </p>
            </div>

            {/* Produit */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Produit</h4>
              <ul className="flex flex-col gap-2.5">
                {["Fonctionnalités", "Tarifs", "Sécurité", "Mises à jour"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Ressources */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Ressources</h4>
              <ul className="flex flex-col gap-2.5">
                {["Documentation", "Guide de démarrage", "API Reference", "Statut"].map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Légal */}
            <div>
              <h4 className="text-white font-semibold text-sm mb-4">Légal</h4>
              <ul className="flex flex-col gap-2.5">
                <li>
                  <button onClick={() => navigate("/privacy")} className="text-sm hover:text-white transition-colors">
                    Politique de confidentialité
                  </button>
                </li>
                <li>
                  <button onClick={() => navigate("/terms")} className="text-sm hover:text-white transition-colors">
                    Conditions d&apos;utilisation
                  </button>
                </li>
                <li>
                  <a href="#" className="text-sm hover:text-white transition-colors">
                    Mentions légales
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm">
              &copy; 2025 SchoolFlow Pro. Tous droits réservés.
            </p>
            <div className="flex items-center gap-2 text-xs">
              <Shield className="w-3.5 h-3.5 text-green-400" />
              <span className="text-green-400">RGPD conforme</span>
              <span className="mx-2 text-gray-700">|</span>
              <span>Hébergé en Europe</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
