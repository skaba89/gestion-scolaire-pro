import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePublicTenant } from "@/hooks/usePublicTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, Users, BookOpen, MapPin, Globe, Calendar, ShieldCheck, ArrowRight } from "lucide-react";
import { getTenantTypeLabel } from "@/types/tenant";

// ─────────────────────────────────────────────
// Color utilities
// ─────────────────────────────────────────────

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lightenHex(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const r = Math.min(255, parseInt(clean.substring(0, 2), 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, parseInt(clean.substring(2, 4), 16) + Math.round(255 * percent / 100));
  const b = Math.min(255, parseInt(clean.substring(4, 6), 16) + Math.round(255 * percent / 100));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function darkenHex(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, parseInt(clean.substring(0, 2), 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, parseInt(clean.substring(2, 4), 16) - Math.round(255 * percent / 100));
  const b = Math.max(0, parseInt(clean.substring(4, 6), 16) - Math.round(255 * percent / 100));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function isValidHex(hex: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(hex);
}

// ─────────────────────────────────────────────
// Animated Background Pattern (SVG)
// ─────────────────────────────────────────────

function BrandPattern({ color }: { color: string }) {
  const c1 = hexToRgba(color, 0.08);
  const c2 = hexToRgba(color, 0.04);
  const c3 = hexToRgba(color, 0.06);
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke={c1} strokeWidth="0.5" />
        </pattern>
        <pattern id="dots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="1" fill={c2} />
        </pattern>
        <radialGradient id="glow1" cx="20%" cy="30%" r="60%">
          <stop offset="0%" stopColor={c3} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="glow2" cx="80%" cy="70%" r="50%">
          <stop offset="0%" stopColor={c2} />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />
      <rect width="100%" height="100%" fill="url(#dots)" />
      <rect width="100%" height="100%" fill="url(#glow1)" />
      <rect width="100%" height="100%" fill="url(#glow2)" />
    </svg>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

const TenantAuthPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { signIn, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const { data: tenantData, isLoading: tenantLoading } = usePublicTenant(tenantSlug);

  // Branding data
  const primaryColor = tenantData?.landing?.primary_color || tenantData?.settings?.primary_color || "#1e3a5f";
  const secondaryColor = tenantData?.landing?.secondary_color || tenantData?.settings?.secondary_color || "#64748b";
  const logoUrl = tenantData?.landing?.logo_url || tenantData?.settings?.logo_url || null;
  const tenantName = tenantData?.name || "";
  const description = tenantData?.landing?.description || "";
  const bannerUrl = tenantData?.landing?.banner_url || null;
  const type = tenantData?.type || "";
  const tagline = tenantData?.landing?.tagline || "";
  const schoolMotto = tenantData?.landing?.school_motto || "";
  const foundedYear = tenantData?.landing?.founded_year || null;
  const accreditation = tenantData?.landing?.accreditation || null;
  const stats = tenantData?.stats || null;
  const address = tenantData?.address || null;
  const website = tenantData?.website || null;
  const contactEmail = tenantData?.landing?.contact_email || tenantData?.email || null;
  const contactPhone = tenantData?.landing?.contact_phone || tenantData?.phone || null;

  // Valid colors
  const pColor = isValidHex(primaryColor) ? primaryColor : "#1e3a5f";
  const sColor = isValidHex(secondaryColor) ? secondaryColor : "#64748b";

  const typeLabel = getTenantTypeLabel(type);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      toast({
        title: "Champs requis",
        description: "Veuillez renseigner votre email et votre mot de passe.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error, profileData } = await signIn(email, password);
      if (error) {
        const msg = error.message || "Identifiants incorrects";
        let description = msg;
        if (msg.includes("401") || msg.includes("identifiant") || msg.includes("credential")) {
          description = "Email ou mot de passe incorrect. Veuillez vérifier vos identifiants.";
        } else if (msg.includes("network") || msg.includes("Network") || msg.includes("ECONNREFUSED")) {
          description = "Impossible de joindre le serveur. Vérifiez que l'API est lancée.";
        } else if (msg.includes("403") || msg.includes("désactivé") || msg.includes("deactivated")) {
          description = "Votre établissement est actuellement désactivé. Contactez un administrateur.";
        }
        toast({ title: "Erreur de connexion", description, variant: "destructive" });
        return;
      }

      const userRoles: string[] = (profileData?.roles as string[]) || [];
      const profileSlug = (profileData?.tenant?.slug as string) || null;

      if (userRoles.includes("SUPER_ADMIN")) {
        navigate("/super-admin", { replace: true });
        return;
      }
      if (!profileSlug) {
        toast({
          title: "Erreur",
          description: "Aucun établissement associé à votre compte. Contactez un administrateur.",
          variant: "destructive",
        });
        return;
      }

      const slug = profileSlug;
      if (userRoles.includes("TENANT_ADMIN") || userRoles.includes("DIRECTOR") || userRoles.includes("STAFF")) {
        navigate(`/${slug}/admin`, { replace: true });
      } else if (userRoles.includes("TEACHER")) {
        navigate(`/${slug}/teacher`, { replace: true });
      } else if (userRoles.includes("PARENT")) {
        navigate(`/${slug}/parent`, { replace: true });
      } else if (userRoles.includes("STUDENT")) {
        navigate(`/${slug}/student`, { replace: true });
      } else if (userRoles.includes("ALUMNI")) {
        navigate(`/${slug}/alumni`, { replace: true });
      } else {
        navigate(`/${slug}/admin`, { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Loading State ───
  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Chargement de votre espace...</p>
        </div>
      </div>
    );
  }

  // ─── Main Layout ───
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ═══════════════════════════════════════
          LEFT PANEL — Branding
          ═══════════════════════════════════════ */}
      <div
        className="relative w-full lg:w-[55%] xl:w-[60%] min-h-[320px] lg:min-h-screen flex flex-col justify-center items-center p-8 lg:p-12 xl:p-16 overflow-hidden"
        style={{
          background: bannerUrl
            ? `linear-gradient(135deg, ${hexToRgba(pColor, 0.92)} 0%, ${hexToRgba(darkenHex(pColor, 25), 0.88)} 100%), url(${bannerUrl}) center/cover no-repeat`
            : `linear-gradient(145deg, ${darkenHex(pColor, 10)} 0%, ${pColor} 40%, ${darkenHex(pColor, 20)} 100%)`,
        }}
      >
        {/* Background Pattern */}
        <BrandPattern color={pColor} />

        {/* Decorative circles */}
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-10"
          style={{ background: `radial-gradient(circle, white, transparent 70%)` }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-8"
          style={{ background: `radial-gradient(circle, white, transparent 70%)` }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-xl mx-auto text-center lg:text-left w-full">
          {/* Logo */}
          <div className="flex flex-col items-center lg:items-start gap-6 mb-8">
            {logoUrl && !logoError ? (
              <div
                className="w-28 h-28 xl:w-32 xl:h-32 rounded-2xl overflow-hidden shadow-2xl bg-white/20 backdrop-blur-md flex items-center justify-center p-2 ring-2 ring-white/30"
              >
                <img
                  src={logoUrl}
                  alt={`Logo ${tenantName}`}
                  className="w-full h-full object-contain drop-shadow-lg"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div
                className="w-24 h-24 xl:w-28 xl:h-28 rounded-2xl flex items-center justify-center shadow-2xl bg-white/15 backdrop-blur-md ring-2 ring-white/20"
              >
                <BookOpen className="w-12 h-12 xl:w-14 xl:h-14 text-white/90" />
              </div>
            )}

            {/* Name & Type */}
            <div className="flex flex-col items-center lg:items-start gap-2">
              <h1 className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight">
                {tenantName || "SchoolFlow Pro"}
              </h1>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white/90 bg-white/15 backdrop-blur-sm border border-white/20"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {typeLabel}
              </span>
            </div>
          </div>

          {/* Description / Tagline / Motto */}
          {(description || tagline || schoolMotto) && (
            <p className="text-white/75 text-sm xl:text-base leading-relaxed mb-8 max-w-md mx-auto lg:mx-0">
              {tagline || schoolMotto || (description && description.length > 120 ? description.substring(0, 120) + "..." : description)}
            </p>
          )}

          {/* Stats */}
          {stats && (stats.student_count > 0 || stats.teacher_count > 0) && (
            <div className="flex items-center justify-center lg:justify-start gap-6 mb-8">
              {stats.student_count > 0 && (
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold text-white leading-none">{stats.student_count.toLocaleString("fr-FR")}</p>
                    <p className="text-[10px] text-white/60 uppercase tracking-wider">Étudiants</p>
                  </div>
                </div>
              )}
              {stats.teacher_count > 0 && (
                <div className="flex items-center gap-2 text-white/80">
                  <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-lg font-bold text-white leading-none">{stats.teacher_count.toLocaleString("fr-FR")}</p>
                    <p className="text-[10px] text-white/60 uppercase tracking-wider">Enseignants</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Info badges */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3 text-xs text-white/65">
            {foundedYear && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {foundedYear}
              </span>
            )}
            {accreditation && (
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" />
                {accreditation}
              </span>
            )}
            {address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {address.length > 40 ? address.substring(0, 40) + "..." : address}
              </span>
            )}
            {website && (
              <span className="inline-flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {website.replace(/^https?:\/\//, "")}
              </span>
            )}
          </div>
        </div>

        {/* Bottom branding */}
        <div className="absolute bottom-6 left-0 right-0 text-center">
          <p className="text-[11px] text-white/40 tracking-wide">
            Propulsé par <span className="font-semibold text-white/50">SchoolFlow Pro</span> — Gestion scolaire intelligente
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          RIGHT PANEL — Login Form
          ═══════════════════════════════════════ */}
      <div className="w-full lg:w-[45%] xl:w-[40%] min-h-screen flex items-center justify-center p-6 sm:p-8 lg:p-12 relative bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Subtle accent strip at top */}
        <div
          className="absolute top-0 left-0 right-0 h-1.5"
          style={{ background: `linear-gradient(90deg, ${pColor}, ${lightenHex(pColor, 30)}, ${sColor})` }}
        />

        <div className="w-full max-w-md space-y-8">
          {/* Mobile-only branding (shown on small screens) */}
          <div className="flex flex-col items-center gap-4 lg:hidden">
            {logoUrl && !logoError ? (
              <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg bg-white p-1 ring-1 ring-slate-200">
                <img
                  src={logoUrl}
                  alt={`Logo ${tenantName}`}
                  className="w-full h-full object-contain"
                  onError={() => setLogoError(true)}
                />
              </div>
            ) : (
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center shadow-lg"
                style={{ background: `linear-gradient(135deg, ${pColor}, ${darkenHex(pColor, 15)})` }}
              >
                <BookOpen className="w-7 h-7 text-white" />
              </div>
            )}
            <div className="text-center">
              <h2 className="text-xl font-bold" style={{ color: pColor }}>{tenantName || "SchoolFlow Pro"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{typeLabel}</p>
            </div>
          </div>

          {/* Welcome header */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Connexion
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Accédez à votre espace de gestion scolaire. Entrez vos identifiants pour continuer.
            </p>
          </div>

          {/* Login Form */}
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                Adresse email
              </Label>
              <div className="relative group">
                <Input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  className="h-12 pl-4 pr-4 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:ring-2 focus:border-transparent"
                  style={{
                    "--tw-ring-color": hexToRgba(pColor, 0.3),
                  } as React.CSSProperties}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Mot de passe
                </Label>
                <button
                  type="button"
                  className="text-xs font-medium hover:underline transition-colors"
                  style={{ color: pColor }}
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-12 pl-4 pr-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:ring-2 focus:border-transparent"
                  style={{
                    "--tw-ring-color": hexToRgba(pColor, 0.3),
                  } as React.CSSProperties}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-semibold text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${pColor}, ${darkenHex(pColor, 18)})`,
              }}
              disabled={submitting || isLoading}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-gradient-to-br from-slate-50 via-white to-slate-50 px-3 text-slate-400">
                ou
              </span>
            </div>
          </div>

          {/* Quick links */}
          <div className="grid grid-cols-1 gap-3">
            {tenantSlug && (
              <a
                href={website || `/${tenantSlug}`}
                target={website ? "_blank" : undefined}
                rel={website ? "noopener noreferrer" : undefined}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
              >
                <Globe className="w-3.5 h-3.5" />
                {website ? "Retour à l'accueil" : "Page de l'établissement"}
              </a>
            )}
          </div>

          {/* Footer info */}
          <div className="space-y-3 text-center">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              En continuant, vous acceptez les conditions d'utilisation et la politique de confidentialité de SchoolFlow Pro.
            </p>
            <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400">
              {contactEmail && (
                <a href={`mailto:${contactEmail}`} className="hover:text-slate-600 transition-colors">
                  {contactEmail}
                </a>
              )}
              {contactPhone && (
                <a href={`tel:${contactPhone}`} className="hover:text-slate-600 transition-colors">
                  {contactPhone}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantAuthPage;
