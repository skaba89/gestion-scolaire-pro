import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  RefreshCw,
  CheckCircle,
  Clock,
  AlertCircle,
  GraduationCap,
  Calendar,
  FileText,
  Loader2,
  ArrowRight
} from "lucide-react";
import { toast } from "sonner";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { studentsService } from "@/features/students/services/studentsService";

const PreRegistration = () => {
  const { user, tenant } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [selectedLevelId, setSelectedLevelId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const { studentLabel, StudentLabel, studentsLabel, StudentsLabel } = useStudentLabel();

  // Récupérer le profil étudiant via studentsService
  const { data: studentProfile, isLoading: studentLoading } = useQuery({
    queryKey: ["student-profile", user?.id, tenant?.id],
    queryFn: () => studentsService.getDetailedProfile(user?.id || "", tenant?.id || ""),
    enabled: !!user?.id && !!tenant?.id,
  });

  // Récupérer l'année académique suivante via studentsService
  const { data: nextAcademicYear } = useQuery({
    queryKey: ["next-academic-year", tenant?.id],
    queryFn: () => studentsService.getNextAcademicYear(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Récupérer les niveaux disponibles via studentsService
  const { data: levels } = useQuery({
    queryKey: ["levels", tenant?.id],
    queryFn: () => studentsService.getLevels(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Vérifier si une pré-inscription existe déjà via studentsService
  const { data: existingApplication } = useQuery({
    queryKey: ["pre-registration", studentProfile?.id, nextAcademicYear?.id],
    queryFn: () => studentsService.getExistingAdmissionApplication(
      tenant?.id || "",
      nextAcademicYear?.id || "",
      studentProfile?.first_name || "",
      studentProfile?.last_name || ""
    ),
    enabled: !!studentProfile?.id && !!nextAcademicYear?.id && !!tenant?.id,
  });

  // Mutation pour soumettre la pré-inscription
  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!studentProfile || !tenant?.id || !nextAcademicYear?.id) {
        throw new Error("Données manquantes");
      }

      await studentsService.submitAdmissionApplication({
        tenant_id: tenant.id,
        academic_year_id: nextAcademicYear.id,
        level_id: selectedLevelId || null,
        student_first_name: studentProfile.first_name,
        student_last_name: studentProfile.last_name,
        student_date_of_birth: studentProfile.date_of_birth,
        student_gender: studentProfile.gender,
        student_address: studentProfile.address,
        parent_first_name: "Pré-réinscription",
        parent_last_name: "Interne",
        parent_email: studentProfile.email || "preinscription@interne.local",
        parent_phone: studentProfile.phone || "N/A",
        notes: `[PRÉ-RÉINSCRIPTION] ${notes}`.trim(),
        status: "SUBMITTED",
        submitted_at: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Pré-réinscription soumise avec succès!");
      setShowConfirmDialog(false);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["pre-registration"] });
    },
    onError: (error) => {
      toast.error("Erreur lors de la soumission. Veuillez réessayer.");
    },
  });

  const currentEnrollment = studentProfile?.enrollments?.find(
    (e: any) => e.academic_years?.is_current
  );

  const getNextLevel = () => {
    if (!currentEnrollment?.level_id || !levels) return null;
    const currentLevelIndex = levels.findIndex(l => l.id === currentEnrollment.level_id);
    if (currentLevelIndex === -1 || currentLevelIndex >= levels.length - 1) return null;
    return levels[currentLevelIndex + 1];
  };

  const nextLevel = getNextLevel();

  const handleSubmit = () => {
    if (!selectedLevelId && nextLevel) {
      setSelectedLevelId(nextLevel.id);
    }
    setShowConfirmDialog(true);
  };

  if (studentLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!studentProfile) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Pré-Réinscription</h1>
          <p className="text-muted-foreground">Effectuez votre demande de réinscription pour l'année suivante</p>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Profil non trouvé</h2>
            <p className="text-muted-foreground">
              Votre compte n'est pas encore associé à un profil {studentLabel}.
              Veuillez contacter l'administration.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!nextAcademicYear) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">Pré-Réinscription</h1>
          <p className="text-muted-foreground">Effectuez votre demande de réinscription pour l'année suivante</p>
        </div>

        <Card>
          <CardContent className="p-8 text-center">
            <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-lg font-semibold mb-2">Pas d'année académique disponible</h2>
            <p className="text-muted-foreground">
              Les inscriptions pour l'année suivante ne sont pas encore ouvertes.
              Veuillez réessayer plus tard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusConfig = {
    DRAFT: { label: "Brouillon", icon: FileText, color: "bg-muted text-muted-foreground" },
    SUBMITTED: { label: "Soumise", icon: Clock, color: "bg-blue-100 text-blue-700" },
    UNDER_REVIEW: { label: "En cours d'examen", icon: RefreshCw, color: "bg-yellow-100 text-yellow-700" },
    ACCEPTED: { label: "Acceptée", icon: CheckCircle, color: "bg-green-100 text-green-700" },
    REJECTED: { label: "Refusée", icon: AlertCircle, color: "bg-red-100 text-red-700" },
    WAITLISTED: { label: "Liste d'attente", icon: Clock, color: "bg-orange-100 text-orange-700" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">Pré-Réinscription</h1>
        <p className="text-muted-foreground">Effectuez votre demande de réinscription pour l'année suivante</p>
      </div>

      {/* Informations actuelles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              Profil {StudentLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="font-medium text-foreground">
                {studentProfile.first_name} {studentProfile.last_name}
              </p>
              <p className="text-sm text-muted-foreground">
                N° Étudiant: {studentProfile.registration_number || "Non attribué"}
              </p>
              {currentEnrollment && (
                <p className="text-sm text-muted-foreground">
                  Niveau actuel: {currentEnrollment.levels?.name || "N/A"}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Année Cible
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-medium text-foreground">{nextAcademicYear.name}</p>
            <p className="text-sm text-muted-foreground">
              Du {new Date(nextAcademicYear.start_date).toLocaleDateString('fr-FR')} au{' '}
              {new Date(nextAcademicYear.end_date).toLocaleDateString('fr-FR')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Demande existante ou nouveau formulaire */}
      {existingApplication ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Demande de Pré-Réinscription
              </CardTitle>
              <Badge className={statusConfig[existingApplication.status as keyof typeof statusConfig]?.color || "bg-muted"}>
                {statusConfig[existingApplication.status as keyof typeof statusConfig]?.label || existingApplication.status}
              </Badge>
            </div>
            <CardDescription>
              Soumise le {new Date(existingApplication.submitted_at || existingApplication.created_at).toLocaleDateString('fr-FR')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">
                Votre demande de pré-réinscription a été enregistrée.
                L'administration examinera votre dossier et vous contactera pour la suite des démarches.
              </p>
              {existingApplication.notes && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-sm font-medium text-foreground mb-1">Notes:</p>
                  <p className="text-sm text-muted-foreground">{existingApplication.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Nouvelle Demande de Pré-Réinscription
            </CardTitle>
            <CardDescription>
              Soumettez votre demande pour l'année {nextAcademicYear.name}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4">
              <p className="text-sm text-foreground">
                <strong>Information:</strong> La pré-réinscription permet de réserver votre place pour l'année suivante.
                L'administration validera votre demande et vous contactera pour finaliser l'inscription.
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="level">Niveau souhaité pour l'année prochaine</Label>
                <Select
                  value={selectedLevelId || (nextLevel?.id || "")}
                  onValueChange={setSelectedLevelId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un niveau" />
                  </SelectTrigger>
                  <SelectContent>
                    {levels?.map((level) => (
                      <SelectItem key={level.id} value={level.id}>
                        {level.name}
                        {level.id === nextLevel?.id && " (Niveau suivant)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {nextLevel && (
                  <p className="text-xs text-muted-foreground">
                    Suggestion: {nextLevel.name} (passage automatique)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes ou commentaires (optionnel)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ajoutez des informations complémentaires si nécessaire..."
                  rows={4}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
              </div>
            </div>

            <Button onClick={handleSubmit} size="lg" className="w-full">
              Soumettre ma Pré-Réinscription
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Dialog de confirmation */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la pré-réinscription</DialogTitle>
            <DialogDescription>
              Vous êtes sur le point de soumettre votre demande de pré-réinscription pour l'année {nextAcademicYear?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{StudentLabel}:</span>
              <span className="font-medium">{studentProfile.first_name} {studentProfile.last_name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Niveau souhaité:</span>
              <span className="font-medium">
                {levels?.find(l => l.id === (selectedLevelId || nextLevel?.id))?.name || "Non spécifié"}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Soumission...
                </>
              ) : (
                "Confirmer"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PreRegistration;
