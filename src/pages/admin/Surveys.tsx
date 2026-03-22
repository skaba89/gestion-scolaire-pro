import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { adminQueries } from "@/queries/admin";
import { SurveyHeader } from "@/components/admin/surveys/SurveyHeader";
import { SurveyStats } from "@/components/admin/surveys/SurveyStats";
import { SurveyList } from "@/components/admin/surveys/SurveyList";
import { SurveyDialog } from "@/components/admin/surveys/SurveyDialog";
import { SurveyResultsDialog } from "@/components/admin/surveys/SurveyResultsDialog";

export default function Surveys() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);
  const [viewingResults, setViewingResults] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    target_audience: "all",
    is_anonymous: true,
    is_active: true,
    starts_at: "",
    ends_at: "",
  });

  // Queries
  const { data: surveys, isLoading } = useQuery({
    ...adminQueries.adminSurveys(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: questions } = useQuery({
    ...adminQueries.adminSurveyQuestions(viewingResults || ""),
    enabled: !!viewingResults,
  });

  const { data: responseCounts } = useQuery({
    ...adminQueries.adminSurveyResponseCounts(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  // Mutations
  const saveMutation = useMutation({
    mutationFn: (data: any) => adminQueries.saveSurvey(tenant?.id || "", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      toast.success(selectedSurvey ? "Sondage mis à jour" : "Sondage créé");
      resetForm();
    },
    onError: () => {
      toast.error("Erreur lors de l'enregistrement");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: adminQueries.deleteSurvey,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["surveys"] });
      toast.success("Sondage supprimé");
    },
    onError: () => {
      toast.error("Erreur lors de la suppression");
    },
  });

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      target_audience: "all",
      is_anonymous: true,
      is_active: true,
      starts_at: "",
      ends_at: "",
    });
    setSelectedSurvey(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (survey: any) => {
    setSelectedSurvey(survey);
    setFormData({
      title: survey.title,
      description: survey.description || "",
      target_audience: survey.target_audience || "all",
      is_anonymous: survey.is_anonymous,
      is_active: survey.is_active,
      starts_at: survey.starts_at ? survey.starts_at.split("T")[0] : "",
      ends_at: survey.ends_at ? survey.ends_at.split("T")[0] : "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.title) {
      toast.error("Le titre est requis");
      return;
    }
    saveMutation.mutate({ ...formData, id: selectedSurvey?.id });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <SurveyHeader onNewSurvey={() => { resetForm(); setIsDialogOpen(true); }} />

      <SurveyStats
        activeCount={surveys?.filter((s) => s.is_active).length || 0}
        totalResponses={Object.values(responseCounts || {}).reduce((a, b) => a + b, 0)}
        totalSurveys={surveys?.length || 0}
      />

      <SurveyList
        surveys={surveys || []}
        responseCounts={responseCounts || {}}
        onEdit={handleEdit}
        onDelete={(id) => deleteMutation.mutate(id)}
        onViewResults={(id) => setViewingResults(id)}
        onNewSurvey={() => setIsDialogOpen(true)}
      />

      <SurveyDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        selectedSurvey={selectedSurvey}
        formData={formData}
        setFormData={setFormData}
        onSubmit={handleSubmit}
        onClose={resetForm}
        isSubmitting={saveMutation.isPending}
      />

      <SurveyResultsDialog
        isOpen={!!viewingResults}
        onOpenChange={() => setViewingResults(null)}
        questions={questions || []}
      />
    </div>
  );
}
