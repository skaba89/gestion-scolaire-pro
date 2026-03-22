import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  GraduationCap,
  ArrowLeft,
  ChevronRight,
  Loader2,
  UserPlus,
  Target
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { CURRENCIES } from "@/hooks/useCurrency";

// New Modular Components
import { PublicProgramsHero } from "@/components/programs/PublicProgramsHero";
import { PublicProgramsGrid } from "@/components/programs/PublicProgramsGrid";
import { PublicSubjectsSection } from "@/components/programs/PublicSubjectsSection";

const Programs = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t } = useTranslation();

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ["public-tenant", tenantSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", tenantSlug)
        .eq("is_active", true)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!tenantSlug,
  });

  const { data: levels, isLoading: levelsLoading } = useQuery({
    queryKey: ["public-levels", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("levels")
        .select("*")
        .eq("tenant_id", tenant!.id)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: subjects } = useQuery({
    queryKey: ["public-subjects", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subjects")
        .select("*")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: fees } = useQuery({
    queryKey: ["public-fees", tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fees")
        .select("*")
        .eq("tenant_id", tenant!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  // Get currency from tenant settings
  const settings = tenant?.settings as Record<string, any> | undefined;
  const currencyCode = settings?.currency || "XOF";
  const currencyConfig = CURRENCIES[currencyCode] || CURRENCIES.XOF;

  const formatAmount = (value: number): string => {
    const formattedNumber = new Intl.NumberFormat(currencyConfig.locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);

    if (currencyConfig.position === "before") {
      return `${currencyConfig.symbol}${formattedNumber}`;
    }
    return `${formattedNumber} ${currencyConfig.symbol}`;
  };

  if (tenantLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <h1 className="text-2xl font-bold text-foreground mb-4">Établissement non trouvé</h1>
        <Link to="/">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à l'accueil
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-gradient-hero text-primary-foreground">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to={`/ecole/${tenantSlug}`} className="flex items-center gap-3">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} className="h-12 w-auto object-contain" />
              ) : (
                <div className="h-12 w-12 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6" />
                </div>
              )}
              <span className="font-display font-bold text-xl hidden sm:block">{tenant.name}</span>
            </Link>
            <div className="flex items-center gap-4">
              <LanguageSwitcher />
              <Link to={`/admissions/${tenantSlug}`}>
                <Button className="bg-sky hover:bg-sky/90">
                  <UserPlus className="w-4 h-4 mr-2" />
                  Postuler
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="bg-muted/50 border-b">
        <div className="container mx-auto px-4 py-3">
          <nav className="flex items-center gap-2 text-sm">
            <Link to={`/ecole/${tenantSlug}`} className="text-muted-foreground hover:text-foreground">
              Accueil
            </Link>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-foreground font-medium">Programmes & Formations</span>
          </nav>
        </div>
      </div>

      <PublicProgramsHero
        title="Nos Programmes & Formations"
        description="Découvrez l'ensemble de nos formations et trouvez le programme qui correspond à vos ambitions."
      />

      <PublicProgramsGrid
        levels={levels || []}
        fees={fees || []}
        levelsLoading={levelsLoading}
        tenantSlug={tenantSlug || ""}
        formatAmount={formatAmount}
      />

      <PublicSubjectsSection subjects={subjects || []} />

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16">
        <Card className="bg-gradient-hero text-primary-foreground border-0">
          <CardContent className="p-8 md:p-12 text-center">
            <Target className="w-12 h-12 mx-auto mb-4 opacity-80" />
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">
              Prêt à commencer votre parcours ?
            </h2>
            <p className="text-primary-foreground/80 mb-6 max-w-xl mx-auto">
              Rejoignez notre établissement et bénéficiez d'une formation de qualité adaptée à vos objectifs.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to={`/admissions/${tenantSlug}`}>
                <Button size="lg" className="bg-sky hover:bg-sky/90">
                  <UserPlus className="w-5 h-5 mr-2" />
                  Déposer ma candidature
                </Button>
              </Link>
              <Link to={`/info/${tenantSlug}`}>
                <Button size="lg" variant="outline" className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10" style={{ color: "white" }}>
                  En savoir plus
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="bg-card border-t border-border py-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant.name}. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Programs;
