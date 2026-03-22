import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  GraduationCap, 
  ArrowLeft,
  MapPin,
  Phone,
  Mail,
  Globe,
  Clock,
  ChevronRight,
  Loader2,
  UserPlus,
  Send,
  CheckCircle,
  MessageSquare
} from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { toast } from "sonner";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  email: z.string().trim().email("Email invalide").max(255),
  phone: z.string().optional(),
  subject: z.string().trim().min(3, "Le sujet doit contenir au moins 3 caractères").max(200),
  message: z.string().trim().min(10, "Le message doit contenir au moins 10 caractères").max(2000),
});

type ContactFormData = z.infer<typeof contactSchema>;

const Contact = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});

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

  const submitMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      // In a real app, you would send this to a backend
      // For now, we'll simulate a successful submission
      await new Promise(resolve => setTimeout(resolve, 1000));
      return data;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Message envoyé avec succès!");
    },
    onError: () => {
      toast.error("Erreur lors de l'envoi du message");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const result = contactSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof ContactFormData] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }
    
    setErrors({});
    submitMutation.mutate(result.data);
  };

  const updateField = (field: keyof ContactFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
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

  if (submitted) {
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
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-20">
          <Card className="max-w-lg mx-auto text-center">
            <CardContent className="p-12">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <h1 className="text-2xl font-display font-bold text-foreground mb-4">
                Message envoyé!
              </h1>
              <p className="text-muted-foreground mb-6">
                Nous avons bien reçu votre message et vous répondrons dans les plus brefs délais.
              </p>
              <Link to={`/ecole/${tenantSlug}`}>
                <Button>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Retour à l'accueil
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
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
            <span className="text-foreground font-medium">Contact</span>
          </nav>
        </div>
      </div>

      {/* Hero Section */}
      <section className="bg-gradient-to-b from-muted/50 to-background py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-foreground mb-4">
              Contactez-nous
            </h1>
            <p className="text-lg text-muted-foreground">
              Une question ? Besoin d'informations ? Notre équipe est à votre disposition pour vous accompagner.
            </p>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  Envoyez-nous un message
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Nom complet *</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="Votre nom"
                        className={errors.name ? "border-destructive" : ""}
                      />
                      {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        placeholder="votre@email.com"
                        className={errors.email ? "border-destructive" : ""}
                      />
                      {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Téléphone</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="+33 6 00 00 00 00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="subject">Sujet *</Label>
                      <Input
                        id="subject"
                        value={formData.subject}
                        onChange={(e) => updateField("subject", e.target.value)}
                        placeholder="Objet de votre message"
                        className={errors.subject ? "border-destructive" : ""}
                      />
                      {errors.subject && <p className="text-sm text-destructive">{errors.subject}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Message *</Label>
                    <Textarea
                      id="message"
                      value={formData.message}
                      onChange={(e) => updateField("message", e.target.value)}
                      placeholder="Écrivez votre message ici..."
                      rows={6}
                      className={errors.message ? "border-destructive" : ""}
                    />
                    {errors.message && <p className="text-sm text-destructive">{errors.message}</p>}
                  </div>

                  <Button type="submit" className="w-full md:w-auto" disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Envoyer le message
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Contact Info Sidebar */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Informations de contact</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {tenant.address && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">Adresse</p>
                      <p className="text-sm text-muted-foreground">{tenant.address}</p>
                    </div>
                  </div>
                )}

                {tenant.phone && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">Téléphone</p>
                      <a href={`tel:${tenant.phone}`} className="text-sm text-primary hover:underline">
                        {tenant.phone}
                      </a>
                    </div>
                  </div>
                )}

                {tenant.email && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">Email</p>
                      <a href={`mailto:${tenant.email}`} className="text-sm text-primary hover:underline">
                        {tenant.email}
                      </a>
                    </div>
                  </div>
                )}

                {tenant.website && (
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">Site web</p>
                      <a href={tenant.website} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                        {tenant.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="w-5 h-5 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">Horaires d'ouverture</h3>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Lundi - Vendredi</span>
                    <span className="text-foreground">8h00 - 17h00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Samedi</span>
                    <span className="text-foreground">8h00 - 12h00</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dimanche</span>
                    <span className="text-foreground">Fermé</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* CTA Card */}
            <Card className="bg-gradient-primary text-primary-foreground border-0">
              <CardContent className="p-6 text-center">
                <UserPlus className="w-8 h-8 mx-auto mb-3 opacity-80" />
                <h3 className="font-semibold mb-2">Prêt à nous rejoindre ?</h3>
                <p className="text-sm text-primary-foreground/80 mb-4">
                  Déposez votre candidature en quelques clics.
                </p>
                <Link to={`/admissions/${tenantSlug}`}>
                  <Button className="w-full bg-sky hover:bg-sky/90">
                    Postuler maintenant
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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

export default Contact;
