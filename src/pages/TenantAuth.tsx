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
import { resolveUploadUrl } from "@/utils/url";

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

function isUuid(value?: string | null): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
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
  const rawLogoUrl = tenantData?.landing?.logo_url || tenantData?.settings?.logo_url || null;
  const logoUrl = rawLogoUrl ? resolveUploadUrl(rawLogoUrl) : null;
  const bannerUrl = resolveUploadUrl(tenantData?.landing?.banner_url || null);
  const tenantName = tenantData?.name || "";
  const description = tenantData?.landing?.description || "";
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
    const normalizedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();

    if (!normalizedEmail || !trimmedPassword) {
      toast({
        title: "Champs requis",
        description: "Veuillez renseigner votre email et votre mot de passe.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      // Tenant login pages must send the current tenant context. Without this,
      // a stale X-Tenant-ID from a previous session can make the backend search
      // the wrong tenant and return 401 even when credentials are correct.
      const tenantId = (tenantData?.id as string | undefined) || null;
      if (isUuid(tenantId)) {
        localStorage.setItem("last_tenant_id", tenantId);
      } else {
        localStorage.removeItem("last_tenant_id");
      }

      const { error, profileData } = await signIn(normalizedEmail, trimmedPassword);
      if (error) {
        const msg = error.message || "Identifiants incorrects";
        console.error("[TenantAuth] Login failed:", msg);
        let description = msg;
        if (msg.includes("401") || msg.includes("identifiant") || msg.includes("credential")) {
          description = `Email ou mot de passe incorrect pour ${tenantName || "cet établissement"}. Utilisez le compte administrateur créé pour cet établissement.`;
        } else if (msg.includes("network") || msg.includes("Network") || msg.includes("ECONNREFUSED")) {
          description = "Impossible de joindre le serveur. Vérifiez que l'API est lancée.";
        } else if (msg.includes("403") || msg.includes("désactivé") || msg.includes("deactivated")) {
          description = "Votre établissement est actuellement désactivé. Contactez un administrateur.";
        } else if (msg.includes("429")) {
          description = "Trop de tentatives de connexion. Veuillez attendre quelques minutes avant de réessayer.";
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

      if (tenantSlug && profileSlug !== tenantSlug) {
        toast({
          title: "Mauvais établissement",
          description: `Ce compte est associé à l'établissement ${profileSlug}, pas à ${tenantSlug}.`,
          variant: "destructive",
        });
        navigate(`/${profileSlug}/admin`, { replace: true });
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
                {tenantName}
              </h1>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white/90 bg-white/15 backdrop-blur-sm border border-white/20"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {typeLabel}
              </span>
            </div>
          </div>

          {/* Tagline */}
          {(tagline || description) && (
            <div className="mb-8 space-y-3">
              {tagline && <p className="text-xl xl:text-2xl font-semibold text-white/95 leading-relaxed">{tagline}</p>}
              {description && <p className="text-white/75 text-base xl:text-lg leading-relaxed max-w-lg">{description}</p>}
            </div>
          )}

          {/* Info Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
            {address && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-white/85">
                <MapPin className="w-5 h-5 shrink-0 text-white/70" />
                <span className="text-sm truncate">{address}</span>
              </div>
            )}
            {website && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-white/85">
                <Globe className="w-5 h-5 shrink-0 text-white/70" />
                <span className="text-sm truncate">{website}</span>
              </div>
            )}
            {foundedYear && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-white/85">
                <Calendar className="w-5 h-5 shrink-0 text-white/70" />
                <span className="text-sm">Fondé en {foundedYear}</span>
              </div>
            )}
            {accreditation && (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/15 text-white/85">
                <ShieldCheck className="w-5 h-5 shrink-0 text-white/70" />
                <span className="text-sm truncate">{accreditation}</span>
              </div>
            )}
          </div>

          {/* Stats */}
          {stats && (
            <div className="flex flex-wrap gap-4">
              {stats.student_count !== undefined && (
                <div className="px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10">
                  <div className="text-2xl font-bold text-white">{stats.student_count}</div>
                  <div className="text-xs text-white/60">Étudiants</div>
                </div>
              )}
              {stats.teacher_count !== undefined && (
                <div className="px-4 py-2 rounded-lg bg-white/10 backdrop-blur-sm border border-white/10">
                  <div className="text-2xl font-bold text-white">{stats.teacher_count}</div>
                  <div className="text-xs text-white/60">Enseignants</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL — Login Form */}
      <div className="w-full lg:w-[45%] xl:w-[40%] min-h-screen flex items-center justify-center p-6 lg:p-10 bg-slate-50 dark:bg-slate-950">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left space-y-2">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
              Connexion
            </h2>
            <p className="text-slate-600 dark:text-slate-400">
              Connectez-vous à votre espace {tenantName || "établissement"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={contactEmail || "admin@etablissement.com"}
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting || isLoading}
              className="w-full h-11 text-base font-semibold"
              style={{ backgroundColor: pColor }}
            >
              {submitting || isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Connexion...
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          <div className="text-center text-sm text-slate-500 dark:text-slate-400">
            Besoin d'aide ? Contactez l'administration de votre établissement.
          </div>
        </div>
      </div>
    </div>
  );
};

export default TenantAuthPage;
