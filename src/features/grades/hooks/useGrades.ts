/**
 * useGrades Hook
 * Centralized hook for Grade and Assessment management
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { gradesService, type Assessment, type AssessmentFormData } from "../services/gradesService";
import type { GradeFormData, GradeFilters, Grade } from "../types/grades";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import { apiClient } from "@/api/client";

export const useGrades = (filters?: GradeFilters & { classId?: string; subjectId?: string; termId?: string }) => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const { logCreate, logUpdate, logDelete } = useAuditLog();

  // ----------------------------------------------------------------------
  // Queries
  // ----------------------------------------------------------------------

  // Fetch Grades
  const gradesQuery = useQuery({
    queryKey: ["grades", currentTenant?.id, filters],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      return gradesService.listGrades(currentTenant.id, filters);
    },
    enabled: !!currentTenant?.id,
  });

  // Fetch Assessments
  const assessmentsQuery = useQuery({
    queryKey: ["assessments", currentTenant?.id, filters?.classId, filters?.subjectId, filters?.termId],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      return gradesService.listAssessments(currentTenant.id, {
        classId: filters?.classId,
        subjectId: filters?.subjectId,
        termId: filters?.termId,
      });
    },
    enabled: !!currentTenant?.id,
  });

  // Fetch Terms
  const termsQuery = useQuery({
    queryKey: ["terms", currentTenant?.id],
    queryFn: async () => {
      if (!currentTenant?.id) return [];
      const { data } = await apiClient.get(`/terms/`); // API automatically filters by tenant via token
      return data;
    },
    enabled: !!currentTenant?.id,
  });

  // Fetch Students for a classroom (Teacher Grade View)
  const studentsQuery = useQuery({
    queryKey: ["classroom-students-grades", filters?.classId],
    queryFn: async () => {
      if (!filters?.classId) return [];
      const { data } = await apiClient.get(`/infrastructure/enrollments`, {
        params: { class_id: filters.classId }
      });
      // The old frontend expected a specific format:
      // student_id, students (id, first_name, last_name, registration_number)
      // So let's map the backend response to the shape the UI expects
      return data.map((enrollment: any) => ({
        student_id: enrollment.student_id,
        students: {
          id: enrollment.student?.id || enrollment.student_id,
          first_name: enrollment.student?.first_name || '',
          last_name: enrollment.student?.last_name || '',
          registration_number: enrollment.student?.registration_number || ''
        }
      }));
    },
    enabled: !!filters?.classId,
  });

  // ----------------------------------------------------------------------
  // Grade Mutations
  // ----------------------------------------------------------------------

  const createGradeMutation = useMutation({
    mutationFn: (data: GradeFormData) => {
      if (!currentTenant?.id) throw new Error("No tenant selected");
      return gradesService.createGrade(currentTenant.id, data);
    },
    onSuccess: (newGrade) => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      logCreate("grade", newGrade.id, newGrade);
      toast.success("Note ajoutée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const updateGradeMutation = useMutation({
    mutationFn: ({ id, data, reason }: { id: string; data: Partial<GradeFormData>; reason?: string }) =>
      gradesService.updateGrade(id, data, reason),
    onSuccess: (updatedGrade) => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      logUpdate("grade", updatedGrade.id, {}, updatedGrade);
      toast.success("Note mise à jour");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const deleteGradeMutation = useMutation({
    mutationFn: ({ id, gradeData }: { id: string; gradeData?: Grade }) => {
      if (gradeData) logDelete("grade", id, gradeData);
      return gradesService.deleteGrade(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      toast.success("Note supprimée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const upsertGradeMutation = useMutation({
    mutationFn: (data: GradeFormData) => {
      if (!currentTenant?.id) throw new Error("No tenant selected");
      return gradesService.upsertGrade(currentTenant.id, data);
    },
    onSuccess: (grade) => {
      queryClient.invalidateQueries({ queryKey: ["grades"] });
      // We don't know if it was create or update easily here without checking return, 
      // but usually upsert is for "saving" state.
      toast.success("Note enregistrée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  // ----------------------------------------------------------------------
  // Assessment Mutations
  // ----------------------------------------------------------------------

  const createAssessmentMutation = useMutation({
    mutationFn: (data: AssessmentFormData) => {
      if (!currentTenant?.id) throw new Error("No tenant selected");
      return gradesService.createAssessment(currentTenant.id, data);
    },
    onSuccess: (newAssessment) => {
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      logCreate("assessment", newAssessment.id, newAssessment);
      toast.success("Évaluation créée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const updateAssessmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AssessmentFormData> }) =>
      gradesService.updateAssessment(id, data),
    onSuccess: (updatedAssessment) => {
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      logUpdate("assessment", updatedAssessment.id, {}, updatedAssessment);
      toast.success("Évaluation modifiée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  const deleteAssessmentMutation = useMutation({
    mutationFn: ({ id, assessmentData }: { id: string; assessmentData?: Assessment }) => {
      if (assessmentData) logDelete("assessment", id, assessmentData);
      return gradesService.deleteAssessment(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["assessments"] });
      queryClient.invalidateQueries({ queryKey: ["grades"] }); // Deleting assessment deletes grades cascade ideally
      toast.success("Évaluation supprimée");
    },
    onError: (error: Error) => toast.error(`Erreur: ${error.message}`),
  });

  return {
    // Data
    grades: gradesQuery.data || [],
    assessments: assessmentsQuery.data || [],
    terms: termsQuery.data || [],
    students: studentsQuery.data || [],
    isLoading: gradesQuery.isLoading || assessmentsQuery.isLoading || termsQuery.isLoading || studentsQuery.isLoading,
    error: gradesQuery.error || assessmentsQuery.error || termsQuery.error || studentsQuery.error,

    // Grade Actions
    createGrade: createGradeMutation.mutate,
    updateGrade: updateGradeMutation.mutate,
    deleteGrade: deleteGradeMutation.mutate,
    upsertGrade: upsertGradeMutation.mutate,

    // Assessment Actions
    createAssessment: createAssessmentMutation.mutate,
    updateAssessment: updateAssessmentMutation.mutate,
    deleteAssessment: deleteAssessmentMutation.mutate,

    // Loading States
    isCreatingGrade: createGradeMutation.isPending,
    isUpdatingGrade: updateGradeMutation.isPending,
    isDeletingGrade: deleteGradeMutation.isPending,
    isCreatingAssessment: createAssessmentMutation.isPending,
    isUpdatingAssessment: updateAssessmentMutation.isPending,
    isDeletingAssessment: deleteAssessmentMutation.isPending,

    // Legacy aliases
    create: createGradeMutation.mutate,
    update: updateGradeMutation.mutate,
    delete: deleteGradeMutation.mutate,
  };
};
