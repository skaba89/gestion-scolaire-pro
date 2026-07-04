import { useState, useEffect, useMemo } from "react";
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
import { useTranslation } from "react-i18next";

// Niveaux par défaut selon le type d'établissement — système guinéen
// (modifiables ensuite dans les réglages)
const DEFAULT_LEVELS: Record<string, string[]> = {
  school: [
    "CP1",
    "CP2",
    "CE1",
    "CE2",
    "CM1",
    "CM2",
    "7ème",
    "8ème",
    "9ème",
    "10ème",
    "11ème",
    "12ème",
    "Terminale",
  ],
  primary: [
    "CP1",
    "CP2",
    "CE1",
    "CE2",
    "CM1",
    "CM2",
  ],
  middle: [
    "7ème",
    "8ème",
    "9ème",
    "10ème",
  ],
  high: [
    "11ème",
    "12ème",
    "Terminale",
  ],
  university: [
    "Licence 1",
    "Licence 2",
    "Licence 3",
    "Master 1",
    "Master 2",
  ],
  training: [
    "Année 1",
    "Année 2",
    "Année 3",
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
  const { t } = useTranslation();
  const { user, profile, roles, hasRole, isLoading: authLoading } = useAuth();
  const { tenant, isLoading: tenantLoading } = useTenant();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { getTenantUrl } = useTenantUrl();

  const TENANT_TYPES = useMemo(() => [
    { value: "school", label: t("createTenant.types.school") },
    { value: "primary", label: t("createTenant.types.primary") },
    { value: "middle", label: t("createTenant.types.middle") },
    { value: "high", label: t("createTenant.types.high") },
    { value: "university", label: t("createTenant.types.university") },
    { value: "training", label: t("createTenant.types.training") },
  ], [t]);
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
        title: t("createTenant.errorTitle"),
        description: t("createTenant.errorRequired"),
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
        title: t("createTenant.successTitle"),
        description: t("createTenant.successDesc", { name: formData.name })
      });

      // Force page reload to refresh auth context with new tenant
      window.location.href = `/${formData.slug}/admin`;

    } catch (error: any) {
      toast({
        title: t("createTenant.errorCreateTitle"),
        description: error.response?.data?.detail || error.message || t("createTenant.errorCreateDesc"),
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
            <h1 className="text-3xl font-bold text-gray-900">{t("createTenant.title")}</h1>
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">
              Souverain API v2
            </span>
          </div>
          <p className="text-gray-600 mt-2">
            {t("createTenant.subtitle")}
          </p>
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              {t("createTenant.cardTitle")}
            </CardTitle>
            <CardDescription>
              {t("createTenant.cardDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="name">{t("createTenant.fieldName")}</Label>
                  <Input
                    id="name"
                    placeholder={t("createTenant.placeholderName")}
                    value={formData.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="slug">{t("createTenant.fieldSlug")}</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">schoolflow.app/</span>
                    <Input
                      id="slug"
                      placeholder={t("createTenant.placeholderSlug")}
                      value={formData.slug}
                      onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">{t("createTenant.fieldType")}</Label>
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
                    {t("createTenant.fieldEmail")}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t("createTenant.placeholderEmail")}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">
                    <Phone className="w-4 h-4 inline mr-2" />
                    {t("createTenant.fieldPhone")}
                  </Label>
                  <Input
                    id="phone"
                    placeholder={t("createTenant.placeholderPhone")}
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">
                    <MapPin className="w-4 h-4 inline mr-2" />
                    {t("createTenant.fieldAddress")}
                  </Label>
                  <Input
                    id="address"
                    placeholder={t("createTenant.placeholderAddress")}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="website">
                    <Globe className="w-4 h-4 inline mr-2" />
                    {t("createTenant.fieldWebsite")}
                  </Label>
                  <Input
                    id="website"
                    placeholder={t("createTenant.placeholderWebsite")}
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
                {isSubmitting ? t("createTenant.submitting") : t("createTenant.submit")}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CreateTenant;
