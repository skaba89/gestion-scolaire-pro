import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  GraduationCap,
  MapPin,
  Phone,
  Mail,
  FileText,
  CheckCircle2,
  Clock,
  Calendar,
  Users,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Loader2,
  ClipboardList,
  CreditCard,
  Building2,
} from "lucide-react";

const AdmissionInfo = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();

  const { data: tenant, isLoading } = useQuery({
    queryKey: ["public-tenant-info", tenantSlug],
    queryFn: async () => {
      if (!tenantSlug) return null;
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", tenantSlug)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!tenantSlug,
  });

  const { data: levels } = useQuery({
    queryKey: ["public-levels", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from("levels")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("order_index");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: fees } = useQuery({
    queryKey: ["public-fees", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase
        .from("fees")
        .select("*")
        .eq("tenant_id", tenant.id)
        .order("amount");
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  const { data: currentYear } = useQuery({
    queryKey: ["public-current-year", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return null;
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("is_current", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tenant?.id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-xl font-bold mb-2">Établissement non trouvé</h1>
            <p className="text-muted-foreground mb-4">
              L'établissement que vous recherchez n'existe pas ou n'est plus actif.
            </p>
            <Link to="/">
              <Button variant="outline">Retour à l'accueil</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const tenantTypeLabels: Record<string, string> = {
    primary_school: "École Primaire",
    middle_school: "Collège",
    high_school: "Lycée",
    university: "Université",
    training_center: "Centre de Formation",
    school: "Établissement Scolaire",
  };

  const requiredDocuments = [
    "Extrait d'acte de naissance ou copie de la carte d'identité",
    "Certificat de scolarité de l'établissement d'origine",
    "Relevé de notes de l'année précédente",
    "Photos d'identité récentes (format passeport)",
    "Photocopie du carnet de vaccination",
    "Justificatif de domicile",
  ];

  const admissionSteps = [
    {
      step: 1,
      title: "Remplir le formulaire en ligne",
      description: "Complétez le formulaire de candidature avec toutes les informations requises.",
      icon: ClipboardList,
    },
    {
      step: 2,
      title: "Soumettre les documents",
      description: "Téléchargez les documents requis (acte de naissance, photos, etc.).",
      icon: FileText,
    },
    {
      step: 3,
      title: "Examen du dossier",
      description: "Notre équipe examine votre candidature dans un délai de 5 à 10 jours ouvrables.",
      icon: Clock,
    },
    {
      step: 4,
      title: "Notification de décision",
      description: "Vous recevrez une notification par email concernant l'acceptation de votre dossier.",
      icon: Mail,
    },
    {
      step: 5,
      title: "Finalisation de l'inscription",
      description: "En cas d'acceptation, procédez au paiement des frais et finalisez l'inscription.",
      icon: CreditCard,
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-gradient-hero relative overflow-hidden">
        <div className="container mx-auto px-4 py-12 relative">
          <Link to={`/${tenantSlug}`} className="inline-flex items-center text-primary-foreground/80 hover:text-primary-foreground mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour à l'accueil
          </Link>
          <div className="flex flex-col md:flex-row items-center gap-6">
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="w-20 h-20 rounded-xl object-cover bg-background/20 shadow-lg"
              />
            ) : (
              <div className="w-20 h-20 rounded-xl bg-background/20 flex items-center justify-center shadow-lg">
                <GraduationCap className="w-10 h-10 text-primary-foreground" />
              </div>
            )}
            <div className="text-center md:text-left">
              <p className="text-primary-foreground/80 text-sm font-medium mb-1">
                {tenantTypeLabels[tenant.type || "school"]}
              </p>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-primary-foreground mb-2">
                {tenant.name}
              </h1>
              <p className="text-primary-foreground/80 text-lg">
                Guide d'Inscription - Informations Pratiques
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Current Year */}
        {currentYear && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-primary" />
                  <span className="font-medium">Année académique en cours:</span>
                  <Badge variant="default" className="text-base">
                    {currentYear.name}
                  </Badge>
                </div>
                <Link to={`/admissions/${tenantSlug}`}>
                  <Button size="lg">
                    Postuler maintenant
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Admission Steps */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary" />
                  Processus d'Admission
                </CardTitle>
                <CardDescription>
                  Suivez ces étapes pour finaliser votre inscription
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {admissionSteps.map((step, index) => (
                    <div key={step.step} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                          {step.step}
                        </div>
                        {index < admissionSteps.length - 1 && (
                          <div className="w-0.5 h-full bg-primary/20 mt-2" />
                        )}
                      </div>
                      <div className="flex-1 pb-6">
                        <div className="flex items-center gap-2 mb-1">
                          <step.icon className="w-4 h-4 text-primary" />
                          <h3 className="font-semibold">{step.title}</h3>
                        </div>
                        <p className="text-muted-foreground text-sm">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Required Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Documents Requis
                </CardTitle>
                <CardDescription>
                  Préparez ces documents avant de soumettre votre candidature
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {requiredDocuments.map((doc, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                      <span>{doc}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            {/* Available Levels */}
            {levels && levels.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-primary" />
                    Niveaux d'Études Disponibles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {levels.map((level) => (
                      <div
                        key={level.id}
                        className="p-3 rounded-lg bg-muted/50 border text-center"
                      >
                        <GraduationCap className="w-6 h-6 text-primary mx-auto mb-2" />
                        <p className="font-medium">{level.name}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* FAQ */}
            <Card>
              <CardHeader>
                <CardTitle>Questions Fréquentes</CardTitle>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="item-1">
                    <AccordionTrigger>
                      Quand puis-je soumettre ma candidature ?
                    </AccordionTrigger>
                    <AccordionContent>
                      Les candidatures sont acceptées tout au long de l'année, sous réserve de disponibilité.
                      Nous vous recommandons de postuler le plus tôt possible pour l'année académique souhaitée.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-2">
                    <AccordionTrigger>
                      Combien de temps prend l'examen du dossier ?
                    </AccordionTrigger>
                    <AccordionContent>
                      L'examen d'un dossier complet prend généralement entre 5 et 10 jours ouvrables.
                      Vous serez notifié par email de la décision.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-3">
                    <AccordionTrigger>
                      Puis-je modifier ma candidature après soumission ?
                    </AccordionTrigger>
                    <AccordionContent>
                      Une fois soumise, vous ne pouvez plus modifier directement votre candidature.
                      Veuillez contacter le service des admissions pour toute modification.
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="item-4">
                    <AccordionTrigger>
                      Quels sont les modes de paiement acceptés ?
                    </AccordionTrigger>
                    <AccordionContent>
                      Nous acceptons les paiements par virement bancaire, espèces, et chèque.
                      Les modalités de paiement vous seront communiquées lors de l'acceptation de votre dossier.
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Fees */}
            {fees && fees.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <CreditCard className="w-5 h-5 text-primary" />
                    Frais de Scolarité
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fees.slice(0, 5).map((fee) => (
                    <div
                      key={fee.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <span className="text-sm font-medium">{fee.name}</span>
                      <Badge variant="secondary">
                        {new Intl.NumberFormat("fr-FR", {
                          style: "currency",
                          currency: "XAF",
                          minimumFractionDigits: 0,
                        }).format(fee.amount)}
                      </Badge>
                    </div>
                  ))}
                  {fees.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Et {fees.length - 5} autres frais...
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Contact */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Contact Admissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {tenant.email && (
                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">Email</p>
                      <a
                        href={`mailto:${tenant.email}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {tenant.email}
                      </a>
                    </div>
                  </div>
                )}
                {tenant.phone && (
                  <div className="flex items-start gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">Téléphone</p>
                      <a
                        href={`tel:${tenant.phone}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {tenant.phone}
                      </a>
                    </div>
                  </div>
                )}
                {tenant.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-4 h-4 text-muted-foreground mt-1" />
                    <div>
                      <p className="text-sm font-medium">Adresse</p>
                      <p className="text-sm text-muted-foreground">{tenant.address}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CTA */}
            <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
              <CardContent className="pt-6 text-center">
                <Users className="w-12 h-12 text-primary mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Prêt à nous rejoindre ?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Commencez votre candidature dès maintenant
                </p>
                <Link to={`/admissions/${tenantSlug}`}>
                  <Button className="w-full" size="lg">
                    Soumettre ma candidature
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-muted/50 border-t border-border py-6 mt-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} {tenant.name}. Tous droits réservés.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default AdmissionInfo;
