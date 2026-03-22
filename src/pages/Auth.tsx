import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { GraduationCap, Mail, Lock, User, ArrowLeft, Shield } from "lucide-react";
import { getRedirectPathForRoles } from "@/components/ProtectedRoute";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTenant } from "@/contexts/TenantContext";

const Auth = () => {
  const { signInWithKeycloak, user, roles, isLoading, signOut: performSignOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { tenant: contextTenant, isLoading: isTenantLoading } = useTenant();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const redirectedRef = useRef(false);

  const tenantSlug = searchParams.get("tenant");

  useEffect(() => {
    // Wait for auth and tenant loading
    if (isLoading || isTenantLoading) {
      return;
    }

    if (redirectedRef.current) {
      return;
    }

    const handleRedirect = async () => {
      if (user) {
        if (roles.length > 0) {
          console.log('[Auth] Authorized user detected, checking redirect...');

          if (!contextTenant && !roles.includes('SUPER_ADMIN')) {
            console.log('[Auth] Waiting for tenant context...');
            return;
          }

          redirectedRef.current = true;
          const from = (location.state as { from?: string })?.from;
          const redirectPath = from || getRedirectPathForRoles(roles, contextTenant?.slug);

          console.log('[Auth] Redirecting to:', redirectPath);
          navigate(redirectPath, { replace: true });
        } else {
          console.log('[Auth] No roles found, redirecting to tenant creation');
          redirectedRef.current = true;
          navigate("/admin/create-tenant", { replace: true });
        }
      }
    };

    handleRedirect();
  }, [user, roles, isLoading, isTenantLoading, navigate, location.state, contextTenant]);

  const handleLogin = async () => {
    setIsRedirecting(true);
    try {
      const { error } = await signInWithKeycloak();
      if (error) throw error;
    } catch (err: any) {
      console.error("SSO Error:", err);
      toast({
        title: "Erreur de connexion",
        description: err.message || "Impossible de se connecter au service d'authentification",
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
