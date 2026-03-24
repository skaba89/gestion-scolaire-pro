import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { getRedirectPathForRoles } from "@/components/ProtectedRoute";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { GraduationCap, Shield } from "lucide-react";

const DEBUG_AUTH_PAGE = import.meta.env.DEV || import.meta.env.VITE_ENABLE_AUTH_DEBUG === "true";
const AUTH_RETURN_TO_KEY = "schoolflow:return_to";

function authPageDebug(...args: unknown[]) {
  if (DEBUG_AUTH_PAGE) {
    console.log("[AuthPage]", ...args);
  }
}

function extractTenantSlugFromPath(path?: string): string | null {
  if (!path) {
    return null;
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const [first, second] = segments;
  if (["ecole", "info", "admissions", "programmes", "calendrier", "contact"].includes(first) && second) {
    return second;
  }

  return first ?? null;
}

const Auth = () => {
  const { signInWithKeycloak, user, roles, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const { tenant: contextTenant, isLoading: isTenantLoading } = useTenant();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectedRef = useRef(false);

  const requestedTenantSlug = searchParams.get("tenant");
  const requestedPath = (location.state as { from?: string } | null)?.from;
  const fallbackTenantSlug = useMemo(
    () => requestedTenantSlug || extractTenantSlugFromPath(requestedPath),
    [requestedTenantSlug, requestedPath],
  );

  useEffect(() => {
    if (isLoading || isTenantLoading || redirectedRef.current) {
      return;
    }

    if (!user) {
      return;
    }

    if (roles.length === 0) {
      authPageDebug("Utilisateur authentifié sans rôle, redirection vers la création de tenant");
      redirectedRef.current = true;
      navigate("/admin/create-tenant", { replace: true });
      return;
    }

    const effectiveTenantSlug = contextTenant?.slug || fallbackTenantSlug;

    if (!effectiveTenantSlug && !roles.includes("SUPER_ADMIN")) {
      authPageDebug("Attente du contexte tenant avant redirection", { roles, fallbackTenantSlug });
      return;
    }

    redirectedRef.current = true;
    const redirectPath = requestedPath || getRedirectPathForRoles(roles, effectiveTenantSlug);
    authPageDebug("Redirection utilisateur authentifié", { redirectPath, effectiveTenantSlug, roles });
    navigate(redirectPath, { replace: true });
  }, [
    user,
    roles,
    isLoading,
    isTenantLoading,
    navigate,
    requestedPath,
    contextTenant?.slug,
    fallbackTenantSlug,
  ]);

  const handleLogin = async () => {
    setIsRedirecting(true);

    const desiredPath = requestedPath || `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.sessionStorage.setItem(AUTH_RETURN_TO_KEY, desiredPath || "/");

    try {
      const { error } = await signInWithKeycloak();
      if (error) {
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Impossible de se connecter au service d'authentification";

      console.error("SSO Error:", error);
      toast({
        title: "Erreur de connexion",
        description: message,
        variant: "destructive",
      });
      setIsRedirecting(false);
    }
  };

  if (isLoading || isTenantLoading || isRedirecting) {
    return (
      <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-6 text-primary-foreground">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="text-lg animate-pulse">Chargement de votre session sécurisée...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-6">
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4 animate-bounce-subtle">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-primary-foreground tracking-tight">
            SchoolFlow Pro
          </h1>
          <p className="text-primary-foreground/80 mt-2 font-medium">
            Architecture Souveraine & Sécurisée
          </p>
        </div>

        <div className="bg-card/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8 border border-white/10 ring-1 ring-black/5">
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-foreground">Bienvenue</h2>
              <p className="text-sm text-muted-foreground">
                Connectez-vous via votre portail institutionnel pour accéder à votre espace.
              </p>
            </div>

            <Button
              type="button"
              variant="hero"
              className="w-full h-14 text-lg font-semibold group transition-all"
              onClick={handleLogin}
              disabled={isRedirecting}
            >
              <Shield className="mr-3 h-5 w-5 transition-transform group-hover:scale-110" />
              Connexion Institutionnelle (SSO)
            </Button>

            <div className="pt-4 border-t border-border/50 text-center">
              <p className="text-xs text-muted-foreground leading-relaxed">
                En vous connectant, vous acceptez nos <Link to="/terms" className="text-primary hover:underline font-medium">conditions d'utilisation</Link>
                <br />
                Propulsé par le système d'authentification souverain Keycloak.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
