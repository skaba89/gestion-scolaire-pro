import { Link, Navigate } from "react-router-dom";
import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  GraduationCap,
  Users,
  BookOpen,
  CreditCard,
  MessageSquare,
  Shield,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "react-i18next";
import { getRedirectPathForRoles } from "@/components/ProtectedRoute";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTenantUrl } from "@/hooks/useTenantUrl";

const Index = () => {
  const { user, roles, isLoading, tenant: contextTenant } = useAuth();
  const { t } = useTranslation();
  const { getTenantUrl } = useTenantUrl();

  // Si l'utilisateur est connecté, le rediriger immédiatement
  if (!isLoading && user) {
    console.log("Index: Authenticated user detected. Roles:", roles);
    const path = getRedirectPathForRoles(roles, contextTenant?.slug);

    // Si on a un chemin métier valide différent de l'accueil
    if (path && path !== "/") {
      console.log("Index: Redirecting to business path:", path);
      return <Navigate to={path} replace />;
    } else {
      // Connecté mais sans rôle métier -> vers création d'établissement (Onboarding)
      const onboardingPath = getTenantUrl("/admin/create-tenant");
      console.log("Index: No business roles found. Redirecting to onboarding:", onboardingPath);
      return <Navigate to={onboardingPath} replace />;
    }
  }
  const features = [
    { icon: Shield, title: "Souveraineté Numérique", description: "Authentification Keycloak (OIDC) et isolation totale des données" },
    { icon: Shield, title: "Conformité RGPD", description: "Gestion native du consentement et droit à la portabilité (Export JSON)" },
    { icon: BarChart3, title: "Pilotage Ministériel", description: "Tableaux de bord BI en temps réel pour une vision globale" },
    { icon: Users, title: "Gestion des Étudiants", description: "Dossiers complets, inscriptions et archivage sécurisé" },
    { icon: CreditCard, title: "E-Finances", description: "Facturation automatisée et recouvrement intégré" },
    { icon: GraduationCap, title: "Excellence Académique", description: "Notes, bulletins et suivi de progression dynamique" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="hero-gradient hero-pattern">
        <nav className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <GraduationCap className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-display font-bold text-primary-foreground tracking-tight">SchoolFlow <span className="text-sky">Pro</span></span>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link to="/auth">
              <Button variant="glass" size="sm">{t("auth.signIn")}</Button>
            </Link>
          </div>
        </nav>

        <div className="container mx-auto px-6 py-24 text-center">
          <h1 className="text-4xl md:text-7xl font-display font-bold text-white mb-6 animate-fade-in tracking-tight">
            Système d'Information<br />
            <span className="text-sky drop-shadow-sm">Scolaire Souverain</span>
          </h1>
          <p className="text-lg md:text-2xl text-white/90 max-w-3xl mx-auto mb-12 animate-fade-in animation-delay-200 leading-relaxed font-light">
            La plateforme SaaS premium pour les institutions d'excellence.
            Alliant sécurité d'État, conformité RGPD et pilotage BI en temps réel.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in animation-delay-300">
            <Link to="/auth">
              <Button variant="hero" size="xl">
                Commencer Maintenant
              </Button>
            </Link>
            <Link to="/demo/admissions">
              <Button variant="glass" size="xl">
                Voir la Démo
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-4">
            Fonctionnalités Complètes
          </h2>
          <p className="text-muted-foreground text-center max-w-2xl mx-auto mb-16">
            Tout ce dont votre établissement a besoin pour une gestion efficace
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={feature.title}
                className="card-elevated p-6 animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary-foreground" />
                </div>
                <h3 className="text-lg font-display font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-hero">
        <div className="container mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-primary-foreground mb-6">
            Prêt à Transformer Votre Établissement?
          </h2>
          <p className="text-primary-foreground/80 mb-10 max-w-xl mx-auto">
            Rejoignez les établissements qui font confiance à SchoolFlow Pro pour leur gestion quotidienne.
          </p>
          <Link to="/auth">
            <Button variant="hero" size="xl">
              Créer Mon Compte
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-16">
        <div className="container mx-auto px-6 text-center text-muted-foreground">
          <p className="mb-2">&copy; 2026 SchoolFlow Pro. Un produit d'excellence technologique.</p>
          <p className="text-sm font-light">Souveraineté • Sécurité • Transparence</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
