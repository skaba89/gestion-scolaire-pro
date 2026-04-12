import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, GraduationCap, Mail, Phone, MapPin, Globe, Loader2 } from "lucide-react";
import { useTenantUrl } from "@/hooks/useTenantUrl";

const TENANT_TYPES = [
  { value: "school", label: "École" },
  { value: "primary", label: "École Primaire" },
  { value: "middle", label: "Collège" },
  { value: "high", label: "Lycée" },
  { value: "university", label: "Université" },
  { value: "training", label: "Centre de Formation" },
];

// Niveaux par défaut selon le type d'établissement
const DEFAULT_LEVELS: Record<string, string[]> = {
  school: [
    "Maternelle Petite Section (PS)",
    "Maternelle Moyenne Section (MS)",
    "Maternelle Grande Section (GS)",
    "CP (Cours Préparatoire)",
    "CE1 (Cours Élémentaire 1)",
    "CE2 (Cours Élémentaire 2)",
    "CM1 (Cours Moyen 1)",
    "CM2 (Cours Moyen 2)",
    "6ème",
    "5ème",
    "4ème",
    "3ème",
    "Seconde",
    "Première",
    "Terminale",
  ],
  primary: [
    "CP (Cours Préparatoire)",
    "CE1 (Cours Élémentaire 1)",
    "CE2 (Cours Élémentaire 2)",
    "CM1 (Cours Moyen 1)",
    "CM2 (Cours Moyen 2)",
  ],
  middle: [
    "6ème",
    "5ème",
    "4ème",
    "3ème",
  ],
  high: [
    "Seconde",
    "Première",
    "Terminale",
  ],
  university: [
    "Licence 1 (L1)",
    "Licence 2 (L2)",
    "Licence 3 (L3)",
    "Master 1 (M1)",
    "Master 2 (M2)",
    "Doctorat",
  ],
  training: [
    "Niveau 1 - Initiation",
    "Niveau 2 - Intermédiaire",
    "Niveau 3 - Avancé",
    "Niveau 4 - Expert",
  ],
};

// Matières par défaut selon le type d'établissement
const DEFAULT_SUBJECTS: Record<string, { name: string; code: string; coefficient: number }[]> = {
  school: [
    { name: "Français", code: "FR", coefficient: 3 },
    { name: "Mathématiques", code: "MATH", coefficient: 3 },
    { name: "Histoire-Géographie", code: "HG", coefficient: 2 },
    { name: "Sciences de la Vie et de la Terre", code: "SVT", coefficient: 2 },
    { name: "Physique-Chimie", code: "PC", coefficient: 2 },
    { name: "Anglais", code: "ANG", coefficient: 2 },
    { name: "Espagnol", code: "ESP", coefficient: 1 },
    { name: "Éducation Civique", code: "EC", coefficient: 1 },
    { name: "Arts Plastiques", code: "ART", coefficient: 1 },
    { name: "Éducation Musicale", code: "MUS", coefficient: 1 },
    { name: "Éducation Physique et Sportive", code: "EPS", coefficient: 1 },
    { name: "Technologie", code: "TECH", coefficient: 1 },
  ],
  primary: [
    { name: "Français", code: "FR", coefficient: 3 },
    { name: "Mathématiques", code: "MATH", coefficient: 3 },
    { name: "Histoire-Géographie", code: "HG", coefficient: 1 },
    { name: "Sciences", code: "SCI", coefficient: 1 },
    { name: "Éducation Civique", code: "EC", coefficient: 1 },
    { name: "Arts Plastiques", code: "ART", coefficient: 1 },
    { name: "Éducation Musicale", code: "MUS", coefficient: 1 },
    { name: "Éducation Physique et Sportive", code: "EPS", coefficient: 1 },
  ],
  middle: [
    { name: "Français", code: "FR", coefficient: 3 },
    { name: "Mathématiques", code: "MATH", coefficient: 3 },
    { name: "Histoire-Géographie", code: "HG", coefficient: 2 },
    { name: "Sciences de la Vie et de la Terre", code: "SVT", coefficient: 2 },
    { name: "Physique-Chimie", code: "PC", coefficient: 2 },
    { name: "Anglais", code: "ANG", coefficient: 2 },
    { name: "Espagnol", code: "ESP", coefficient: 2 },
    { name: "Technologie", code: "TECH", coefficient: 1 },
    { name: "Arts Plastiques", code: "ART", coefficient: 1 },
    { name: "Éducation Musicale", code: "MUS", coefficient: 1 },
    { name: "Éducation Physique et Sportive", code: "EPS", coefficient: 1 },
  ],
  high: [
    { name: "Français", code: "FR", coefficient: 3 },
    { name: "Philosophie", code: "PHILO", coefficient: 3 },
    { name: "Mathématiques", code: "MATH", coefficient: 4 },
    { name: "Histoire-Géographie", code: "HG", coefficient: 2 },
    { name: "Sciences de la Vie et de la Terre", code: "SVT", coefficient: 2 },
    { name: "Physique-Chimie", code: "PC", coefficient: 3 },
    { name: "Anglais", code: "ANG", coefficient: 2 },
    { name: "Espagnol", code: "ESP", coefficient: 2 },
    { name: "Sciences Économiques et Sociales", code: "SES", coefficient: 2 },
    { name: "Éducation Physique et Sportive", code: "EPS", coefficient: 1 },
  ],
  university: [
    { name: "Module Principal", code: "MOD1", coefficient: 4 },
    { name: "Module Secondaire", code: "MOD2", coefficient: 3 },
    { name: "Méthodologie", code: "METH", coefficient: 2 },
    { name: "Langues Étrangères", code: "LANG", coefficient: 2 },
    { name: "Informatique", code: "INFO", coefficient: 2 },
    { name: "Projet de Recherche", code: "RECH", coefficient: 3 },
  ],
  training: [
    { name: "Module Théorique", code: "THEO", coefficient: 2 },
    { name: "Module Pratique", code: "PRAT", coefficient: 3 },
    { name: "Études de Cas", code: "CAS", coefficient: 2 },
    { name: "Projet Final", code: "PROJ", coefficient: 3 },
  ],
};

const CreateTenant = () => {
  const { user, profile, roles, hasRole, isLoading: authLoading } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getTenantUrl } = useTenantUrl();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    type: "primary",
    email: "",
    phone: "",
    address: "",
    website: "",
  });

  // Redirect users who already have a tenant and are not SUPER_ADMIN
  useEffect(() => {
    if (authLoading || tenantLoading) return;

    // If user has a tenant and is not SUPER_ADMIN, redirect to their dashboard
    if (tenant && !hasRole("SUPER_ADMIN")) {
      const prefix = `/${tenant.slug}`;
      const redirectPath = roles.includes("TENANT_ADMIN") || roles.includes("DIRECTOR")
        ? `${prefix}/admin`
        : roles.includes("TEACHER")
          ? `${prefix}/teacher`
          : roles.includes("PARENT")
            ? `${prefix}/parent`
            : roles.includes("STUDENT")
              ? `${prefix}/student`
              : roles.includes("DEPARTMENT_HEAD" as any)
                ? `${prefix}/department`
                : "/";
      navigate(redirectPath, { replace: true });
    }
  }, [tenant, roles, hasRole, authLoading, tenantLoading, navigate]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
  };

  const handleNameChange = (value: string) => {
    setFormData({
      ...formData,
      name: value,
      slug: generateSlug(value),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !formData.name || !formData.slug) {
      toast({
        title: "Erreur",
        description: "Veuillez remplir tous les champs obligatoires",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Single call to backend API to create everything (Tenant, AcademicYear, Campus, Levels, Subjects)
      // and update user profile/role
      const response = await apiClient.post('/tenants/', {
        name: formData.name,
        slug: formData.slug,
        type: formData.type,
        email: formData.email || null,
        phone: formData.phone || null,
        address: formData.address || null,
        website: formData.website || null,
      });

      toast({
        title: "Établissement créé!",
        description: `${formData.name} a été créé avec succès.`
      });

      // Force page reload to refresh auth context with new tenant
      window.location.href = `/${formData.slug}/admin`;

    } catch (error: any) {
      toast({
        title: "Erreur de création",
        description: error.response?.data?.detail || error.message || "Une erreur est survenue lors de la création",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-primary flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="flex items-center justify-center gap-2 mt-2">
            <h1 className="text-3xl font-bold text-gray-900">Créer un établissement</h1>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">
              Souverain API v2
            </span>
          </div>
          <p className="text-gray-600 mt-2">
            Configurez votre établissement pour commencer
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Informations de l'établissement
            </CardTitle>
            <CardDescription>
              Ces informations seront visibles sur votre portail
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">Nom de l'établissement *</Label>
                  <Input
                    id="name"
                    placeholder="Lycée Victor Hugo"
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">URL personnalisée *</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">schoolflow.app/</span>
                    <Input
                      id="slug"
                      placeholder="lycee-victor-hugo"
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Type d'établissement</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(v) => setFormData({ ...formData, type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TENANT_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">
                    <Mail className="w-4 h-4 inline mr-2" />
                    Email
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@lycee.fr"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">
                    <Phone className="w-4 h-4 inline mr-2" />
                    Téléphone
                  </Label>
                  <Input
                    id="phone"
                    placeholder="+33 1 23 45 67 89"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">
                    <MapPin className="w-4 h-4 inline mr-2" />
                    Adresse
                  </Label>
                  <Input
                    id="address"
                    placeholder="123 Rue de l'Éducation, 75001 Paris"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="website">
                    <Globe className="w-4 h-4 inline mr-2" />
                    Site web
                  </Label>
                  <Input
                    id="website"
                    placeholder="https://www.lycee-victor-hugo.fr"
                    value={formData.website}
                    onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Création en cours..." : "Créer l'établissement"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateTenant;
