import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  GraduationCap,
  User,
  Users,
  MapPin,
  Phone,
  Mail,
  Calendar,
  CheckCircle,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { useStudentLabel } from "@/hooks/useStudentLabel";

const applicationSchema = z.object({
  student_first_name: z.string().min(2, "Le prénom doit contenir au moins 2 caractères").max(50),
  student_last_name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(50),
  student_date_of_birth: z.string().min(1, "La date de naissance est requise"),
  student_gender: z.string().min(1, "Le genre est requis"),
  student_address: z.string().max(200).optional(),
  student_previous_school: z.string().max(100).optional(),
  parent_first_name: z.string().min(2, "Le prénom doit contenir au moins 2 caractères").max(50),
  parent_last_name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(50),
  parent_email: z.string().email("Email invalide").max(100),
  parent_phone: z.string().min(8, "Numéro de téléphone invalide").max(20),
  parent_address: z.string().max(200).optional(),
  parent_occupation: z.string().max(100).optional(),
  level_id: z.string().optional(),
  notes: z.string().max(500).optional(),
});

type ApplicationFormData = z.infer<typeof applicationSchema>;

const AdmissionForm = () => {
  const { tenantSlug } = useParams<{ tenantSlug: string }>();
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<ApplicationFormData>({
    student_first_name: "",
    student_last_name: "",
    student_date_of_birth: "",
    student_gender: "",
    student_address: "",
    student_previous_school: "",
    parent_first_name: "",
    parent_last_name: "",
    parent_email: "",
    parent_phone: "",
    parent_address: "",
    parent_occupation: "",
    level_id: "",
    notes: "",
  });

  const { data: tenant, isLoading: tenantLoading } = useQuery({
    queryKey: ["public-tenant", tenantSlug],
    queryFn: async () => {
      if (!tenantSlug) return null;
      const { data } = await apiClient.get(`/tenants/slug/${tenantSlug}`);
      return data;
    },
    enabled: !!tenantSlug,
  });

  const { data: levels } = useQuery({
    queryKey: ["public-levels", tenant?.slug],
    queryFn: async () => {
      if (!tenant?.slug) return [];
      const { data } = await apiClient.get<any[]>(`/tenants/slug/${tenant.slug}/levels`);
      return data || [];
    },
    enabled: !!tenant?.slug,
  });

  const { data: academicYear } = useQuery({
    queryKey: ["public-academic-year", tenant?.slug],
    queryFn: async () => {
      if (!tenant?.slug) return null;
      try {
        const { data } = await apiClient.get(`/tenants/slug/${tenant.slug}/academic-years/current`);
        return data;
      } catch (e) {
        return null;
      }
    },
    enabled: !!tenant?.slug,
  });

  const submitMutation = useMutation({
    mutationFn: async (data: ApplicationFormData) => {
      const payload = {
        ...data,
        tenant_id: tenant?.id,
        academic_year_id: academicYear?.id,
      };

      const { data: response } = await apiClient.post(
        `/operational/admissions/public/apply`,
        payload
      );
      return response;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Candidature soumise avec succès!");
    },
    onError: (error: any) => {
      const msg = error.response?.data?.detail || "Erreur lors de la soumission. Veuillez réessayer.";
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = applicationSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      toast.error("Veuillez corriger les erreurs dans le formulaire");
      return;
    }

    submitMutation.mutate(formData);
  };

  const updateField = (field: keyof ApplicationFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  if (tenantLoading) {
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
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour à l'accueil
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-display font-bold mb-2">
              Candidature Soumise!
            </h1>
            <p className="text-muted-foreground mb-6">
              Votre candidature pour {tenant.name} a été enregistrée avec succès.
              Vous recevrez un email de confirmation à l'adresse {formData.parent_email}.
            </p>
            <p className="text-sm text-muted-foreground mb-6">
              L'équipe d'admission examinera votre dossier et vous contactera prochainement.
            </p>
            <Link to="/">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Retour à l'accueil
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-gradient-hero py-8">
        <div className="container mx-auto px-4">
          <Link to="/" className="inline-flex items-center gap-2 text-primary-foreground/80 hover:text-primary-foreground mb-4">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </Link>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-background/20 flex items-center justify-center">
              <GraduationCap className="w-8 h-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold text-primary-foreground">
                {tenant.name}
              </h1>
              <p className="text-primary-foreground/80">Formulaire de Candidature ({studentLabel}s)</p>
            </div>
          </div>
        </div>
      </header>

      {/* Form */}
      <div className="container mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto space-y-8">
          {/* Student Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Informations de l'{StudentLabel}
              </CardTitle>
              <CardDescription>
                Renseignez les informations concernant l'{studentLabel} à inscrire
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="student_first_name">Prénom *</Label>
                  <Input
                    id="student_first_name"
                    value={formData.student_first_name}
                    onChange={(e) => updateField("student_first_name", e.target.value)}
                    placeholder={`Prénom de l'${studentLabel}`}
                    className={errors.student_first_name ? "border-destructive" : ""}
                  />
                  {errors.student_first_name && (
                    <p className="text-xs text-destructive">{errors.student_first_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student_last_name">Nom *</Label>
                  <Input
                    id="student_last_name"
                    value={formData.student_last_name}
                    onChange={(e) => updateField("student_last_name", e.target.value)}
                    placeholder={`Nom de l'${studentLabel}`}
                    className={errors.student_last_name ? "border-destructive" : ""}
                  />
                  {errors.student_last_name && (
                    <p className="text-xs text-destructive">{errors.student_last_name}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="student_date_of_birth">Date de naissance *</Label>
                  <Input
                    id="student_date_of_birth"
                    type="date"
                    value={formData.student_date_of_birth}
                    onChange={(e) => updateField("student_date_of_birth", e.target.value)}
                    className={errors.student_date_of_birth ? "border-destructive" : ""}
                  />
                  {errors.student_date_of_birth && (
                    <p className="text-xs text-destructive">{errors.student_date_of_birth}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="student_gender">Genre *</Label>
                  <Select
                    value={formData.student_gender}
                    onValueChange={(value) => updateField("student_gender", value)}
                  >
                    <SelectTrigger className={errors.student_gender ? "border-destructive" : ""}>
                      <SelectValue placeholder="Sélectionner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">Masculin</SelectItem>
                      <SelectItem value="F">Féminin</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.student_gender && (
                    <p className="text-xs text-destructive">{errors.student_gender}</p>
                  )}
                </div>
              </div>

              {levels && levels.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="level_id">Niveau souhaité</Label>
                  <Select
                    value={formData.level_id}
                    onValueChange={(value) => updateField("level_id", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner un niveau" />
                    </SelectTrigger>
                    <SelectContent>
                      {levels.map((level) => (
                        <SelectItem key={level.id} value={level.id}>
                          {level.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="student_address">Adresse</Label>
                <Input
                  id="student_address"
                  value={formData.student_address}
                  onChange={(e) => updateField("student_address", e.target.value)}
                  placeholder="Adresse de résidence"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="student_previous_school">École précédente</Label>
                <Input
                  id="student_previous_school"
                  value={formData.student_previous_school}
                  onChange={(e) => updateField("student_previous_school", e.target.value)}
                  placeholder={`Nom de l'école précédente (si applicable)`}
                />
              </div>
            </CardContent>
          </Card>

          {/* Parent Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Informations du Parent/Tuteur
              </CardTitle>
              <CardDescription>
                Renseignez les coordonnées du parent ou tuteur légal
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parent_first_name">Prénom *</Label>
                  <Input
                    id="parent_first_name"
                    value={formData.parent_first_name}
                    onChange={(e) => updateField("parent_first_name", e.target.value)}
                    placeholder="Prénom du parent"
                    className={errors.parent_first_name ? "border-destructive" : ""}
                  />
                  {errors.parent_first_name && (
                    <p className="text-xs text-destructive">{errors.parent_first_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_last_name">Nom *</Label>
                  <Input
                    id="parent_last_name"
                    value={formData.parent_last_name}
                    onChange={(e) => updateField("parent_last_name", e.target.value)}
                    placeholder="Nom du parent"
                    className={errors.parent_last_name ? "border-destructive" : ""}
                  />
                  {errors.parent_last_name && (
                    <p className="text-xs text-destructive">{errors.parent_last_name}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="parent_email">Email *</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="parent_email"
                      type="email"
                      value={formData.parent_email}
                      onChange={(e) => updateField("parent_email", e.target.value)}
                      placeholder="email@exemple.com"
                      className={`pl-10 ${errors.parent_email ? "border-destructive" : ""}`}
                    />
                  </div>
                  {errors.parent_email && (
                    <p className="text-xs text-destructive">{errors.parent_email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="parent_phone">Téléphone *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="parent_phone"
                      value={formData.parent_phone}
                      onChange={(e) => updateField("parent_phone", e.target.value)}
                      placeholder="+225 XX XX XX XX"
                      className={`pl-10 ${errors.parent_phone ? "border-destructive" : ""}`}
                    />
                  </div>
                  {errors.parent_phone && (
                    <p className="text-xs text-destructive">{errors.parent_phone}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_occupation">Profession</Label>
                <Input
                  id="parent_occupation"
                  value={formData.parent_occupation}
                  onChange={(e) => updateField("parent_occupation", e.target.value)}
                  placeholder="Profession du parent"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="parent_address">Adresse</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="parent_address"
                    value={formData.parent_address}
                    onChange={(e) => updateField("parent_address", e.target.value)}
                    placeholder="Adresse complète"
                    className="pl-10"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Informations Complémentaires</CardTitle>
              <CardDescription>
                Ajoutez toute information pertinente pour la candidature
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes additionnelles</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => updateField("notes", e.target.value)}
                  placeholder="Informations supplémentaires, besoins spéciaux, etc."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link to="/">
              <Button type="button" variant="outline">
                Annuler
              </Button>
            </Link>
            <Button
              type="submit"
              disabled={submitMutation.isPending}
              size="lg"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Soumettre la Candidature
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdmissionForm;
