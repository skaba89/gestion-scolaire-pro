import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { usePublicTenant } from "@/hooks/usePublicTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter
} from "@/components/ui/card";
import { GraduationCap, Eye, EyeOff, Building2, Loader2 } from "lucide-react";

/**
 * Hex color to CSS-compatible format with opacity.
 * Converts #rrggbb to rgba(r, g, b, alpha).
 */
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Lighten a hex color by mixing with white.
 */
function lightenHex(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const r = Math.min(255, parseInt(clean.substring(0, 2), 16) + Math.round(255 * percent / 100));
  const g = Math.min(255, parseInt(clean.substring(2, 4), 16) + Math.round(255 * percent / 100));
  const b = Math.min(255, parseInt(clean.substring(4, 6), 16) + Math.round(255 * percent / 100));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * Darken a hex color by reducing RGB values.
 */
function darkenHex(hex: string, percent: number): string {
  const clean = hex.replace("#", "");
  const r = Math.max(0, parseInt(clean.substring(0, 2), 16) - Math.round(255 * percent / 100));
  const g = Math.max(0, parseInt(clean.substring(2, 4), 16) - Math.round(255 * percent / 100));
  const b = Math.max(0, parseInt(clean.substring(4, 6), 16) - Math.round(255 * percent / 100));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

const TenantAuthPage = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { signIn, isLoading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fetch public tenant data for branding
  const { data: tenantData, isLoading: tenantLoading } = usePublicTenant(tenantSlug);

  // Extract branding values with defaults
  const primaryColor = tenantData?.landing?.primary_color || tenantData?.settings?.primary_color || "#1e3a5f";
  const secondaryColor = tenantData?.landing?.secondary_color || tenantData?.settings?.secondary_color || "#64748b";
  const logoUrl = tenantData?.landing?.logo_url || tenantData?.settings?.logo_url || null;
  const tenantName = tenantData?.name || "";
  const description = tenantData?.landing?.description || "";
  const bannerUrl = tenantData?.landing?.banner_url || null;
  const type = tenantData?.type || "";

  // Generate dynamic styles from tenant colors
  const brandStyle = useMemo(() => ({
    background: bannerUrl
      ? `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${bannerUrl}) center/cover no-repeat`
      : `linear-gradient(135deg, ${hexToRgba(primaryColor, 0.08)} 0%, ${hexToRgba(secondaryColor, 0.06)} 50%, ${hexToRgba(primaryColor, 0.04)} 100%)`,
    "--brand-primary": primaryColor,
    "--brand-primary-light": lightenHex(primaryColor, 20),
    "--brand-primary-dark": darkenHex(primaryColor, 15),
    "--brand-secondary": secondaryColor,
  } as React.CSSProperties), [primaryColor, secondaryColor, bannerUrl]);

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

      if (userRoles.includes("SUPER_ADMIN") && !profileSlug) {
        navigate("/super-admin", { replace: true });
        return;
      }
      if (userRoles.includes("SUPER_ADMIN") && profileSlug) {
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

  // Loading state while fetching tenant data
  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:from-gray-900 dark:to-gray-900">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={brandStyle}>
      <Card className="w-full max-w-md shadow-2xl border-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-sm">
        <CardHeader className="text-center space-y-3 pb-4">
          {/* Logo or icon */}
          {logoUrl ? (
            <div className="mx-auto w-16 h-16 rounded-2xl overflow-hidden shadow-lg border border-gray-100 dark:border-gray-700 bg-white p-1">
              <img
                src={logoUrl}
                alt={`Logo ${tenantName}`}
                className="w-full h-full object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          ) : (
            <div
              className="mx-auto w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: `linear-gradient(135deg, ${primaryColor}, ${darkenHex(primaryColor, 15)})` }}
            >
              {type === "university" ? (
                <GraduationCap className="w-8 h-8 text-white" />
              ) : (
                <Building2 className="w-8 h-8 text-white" />
              )}
            </div>
          )}

          {/* Tenant name */}
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight" style={{ color: primaryColor }}>
              {tenantName || "SchoolFlow Pro"}
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground mt-1">
              {description
                ? description.length > 80 ? description.substring(0, 80) + "..." : description
                : "Connectez-vous à votre espace de gestion scolaire"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">Adresse email</Label>
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">Mot de passe</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Votre mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold text-white shadow-lg hover:shadow-xl transition-all"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${darkenHex(primaryColor, 15)})`,
              }}
              disabled={submitting || isLoading}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  Connexion en cours...
                </span>
              ) : (
                "Se connecter"
              )}
            </Button>
          </form>
        </CardContent>

        <CardFooter className="flex flex-col gap-3 text-center text-xs text-muted-foreground pb-6">
          {tenantSlug && (
            <a
              href={`/${tenantSlug}`}
              className="underline underline-offset-2 hover:text-foreground transition-colors"
            >
              Retour à la page de l'établissement
            </a>
          )}
          <a
            href="/auth"
            className="underline underline-offset-2 hover:text-foreground transition-colors"
          >
            Page de connexion générale
          </a>
        </CardFooter>
      </Card>
    </div>
  );
};

export default TenantAuthPage;
