import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, GraduationCap, ArrowRight, Shield, BookOpen, Users } from "lucide-react";

// ─────────────────────────────────────────────
// Animated Background Pattern
// ─────────────────────────────────────────────

function LoginPattern() {
  return (
    <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="loginGrid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.5" />
        </pattern>
        <pattern id="loginDots" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="10" cy="10" r="0.8" fill="rgba(255,255,255,0.03)" />
        </pattern>
        <radialGradient id="loginGlow1" cx="15%" cy="25%" r="55%">
          <stop offset="0%" stopColor="rgba(99,102,241,0.08)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="loginGlow2" cx="85%" cy="75%" r="45%">
          <stop offset="0%" stopColor="rgba(79,70,229,0.06)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#loginGrid)" />
      <rect width="100%" height="100%" fill="url(#loginDots)" />
      <rect width="100%" height="100%" fill="url(#loginGlow1)" />
      <rect width="100%" height="100%" fill="url(#loginGlow2)" />
    </svg>
  );
}

const AuthNative = () => {
  const { signIn, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
        }
        toast({
          title: "Erreur de connexion",
          description,
          variant: "destructive",
        });
        return;
      }

      const userRoles: string[] = (profileData?.roles as string[]) || [];
      const tenantSlug = (profileData?.tenant?.slug as string) || null;

      if (userRoles.includes("SUPER_ADMIN")) {
        navigate("/super-admin", { replace: true });
        return;
      }

      if (!tenantSlug) {
        toast({
          title: "Erreur",
          description: "Aucun établissement associé à votre compte. Contactez un administrateur.",
          variant: "destructive",
        });
        return;
      }

      const slug = tenantSlug;
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

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ═══════════════════════════════════════
          LEFT PANEL — SchoolFlow Pro Branding
          ═══════════════════════════════════════ */}
      <div
        className="relative w-full lg:w-[55%] xl:w-[60%] min-h-[320px] lg:min-h-screen flex flex-col justify-center items-center p-8 lg:p-12 xl:p-16 overflow-hidden"
        style={{
          background: "linear-gradient(145deg, #0f172a 0%, #1e1b4b 40%, #1e3a5f 100%)",
        }}
      >
        <LoginPattern />

        {/* Decorative circles */}
        <div
          className="absolute -top-24 -right-24 w-72 h-72 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.3), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-8"
          style={{ background: "radial-gradient(circle, rgba(79,70,229,0.2), transparent 70%)" }}
        />

        {/* Content */}
        <div className="relative z-10 max-w-xl mx-auto text-center lg:text-left w-full">
          {/* Logo + Brand */}
          <div className="flex flex-col items-center lg:items-start gap-6 mb-8">
            <div className="w-28 h-28 xl:w-32 xl:h-32 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-2xl ring-2 ring-white/20">
              <GraduationCap className="w-14 h-14 xl:w-16 xl:h-16 text-white drop-shadow-lg" />
            </div>

            <div className="flex flex-col items-center lg:items-start gap-2">
              <h1 className="text-3xl xl:text-4xl font-extrabold text-white tracking-tight leading-tight">
                SchoolFlow Pro
              </h1>
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white/90 bg-white/15 backdrop-blur-sm border border-white/20"
              >
                <Shield className="w-3.5 h-3.5" />
                Plateforme de gestion scolaire
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-white/75 text-sm xl:text-base leading-relaxed mb-10 max-w-md mx-auto lg:mx-0">
            La solution complète pour la gestion de votre établissement scolaire.
            Inscriptions, notes, emplois du temps et bien plus encore.
          </p>

          {/* Feature highlights */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-4 mb-10">
            {[
              { icon: Users, label: "Gestion multi-établissements" },
              { icon: BookOpen, label: "Suivi pédagogique" },
              { icon: Shield, label: "Sécurité renforcée" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-2 text-white/70 text-xs"
              >
                <div className="w-8 h-8 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center">
                  <item.icon className="w-4 h-4" />
                </div>
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom branding */}
        <div className="absolute bottom-6 left-0 right-0 text-center">
          <p className="text-[11px] text-white/40 tracking-wide">
            SchoolFlow Pro — Gestion scolaire intelligente
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════
          RIGHT PANEL — Login Form
          ═══════════════════════════════════════ */}
      <div className="w-full lg:w-[45%] xl:w-[40%] min-h-screen flex items-center justify-center p-6 sm:p-8 lg:p-12 relative bg-gradient-to-br from-slate-50 via-white to-slate-50">
        {/* Accent strip */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-blue-500 to-indigo-600" />

        <div className="w-full max-w-md space-y-8">
          {/* Mobile-only branding */}
          <div className="flex flex-col items-center gap-4 lg:hidden">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
              <GraduationCap className="w-7 h-7 text-white" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-900">SchoolFlow Pro</h2>
              <p className="text-xs text-slate-500 mt-0.5">Plateforme de gestion scolaire</p>
            </div>
          </div>

          {/* Welcome header */}
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Connexion</h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              Accédez à la plateforme SchoolFlow Pro. Entrez vos identifiants pour continuer.
            </p>
          </div>

          {/* Login Form */}
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-700">
                Adresse email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@schoolflow.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                className="h-12 pl-4 pr-4 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-transparent"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium text-slate-700">
                  Mot de passe
                </Label>
                <button
                  type="button"
                  className="text-xs font-medium text-indigo-600 hover:underline transition-colors"
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
                  className="h-12 pl-4 pr-11 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:ring-2 focus:ring-indigo-200 focus:border-transparent"
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
              className="w-full h-12 text-base font-semibold text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
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
          <div className="grid grid-cols-2 gap-3">
            <a
              href="/connexion"
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200"
            >
              <Users className="w-3.5 h-3.5" />
              Trouver mon établissement
            </a>
            <a
              href="/"
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium text-white transition-all duration-200 hover:opacity-90 shadow-sm bg-gradient-to-r from-slate-600 to-slate-700"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Retour à l'accueil
            </a>
          </div>

          {/* Footer */}
          <div className="text-center">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              En continuant, vous acceptez les conditions d'utilisation et la politique de confidentialité de SchoolFlow Pro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthNative;
