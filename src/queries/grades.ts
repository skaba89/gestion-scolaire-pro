import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface Assessment {
    id: string;
    tenant_id: string;
    class_id: string;
    subject_id: string;
    term_id: string;
    name: string;
    type: string;
    date: string;
    max_score: number;
    weight: number;
    created_by?: string;
    created_at?: string;
    subjects?: { name: string, code: string | null };
    classrooms?: { name: string };
}

export interface Grade {
    id: string;
    tenant_id: string;
    student_id: string;
    assessment_id: string;
    score: number;
    created_by?: string;
    created_at?: string;
    updated_at?: string;
}

export const assessmentQueries = {
    all: (tenantId: string, classroomId?: string) => ({
        queryKey: ["assessments", tenantId, classroomId],
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<Assessment[]>("/assessments/", {
                params: { class_id: classroomId !== "all" ? classroomId : undefined }
            });
            return response.data;
        },
    }),
};

export const useGradeQueries = (assessmentId?: string) => {
    return useQuery({
        queryKey: ["assessment-grades", assessmentId],
        queryFn: async () => {
            if (!assessmentId) return [];
            const response = await apiClient.get<Grade[]>("/grades/", {
                params: { assessment_id: assessmentId }
            });
            return response.data;
        },
        enabled: !!assessmentId,
    });
};

export const useCreateAssessment = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (assessment: Omit<Assessment, "id" | "created_at">) => {
            const response = await apiClient.post<Assessment>("/assessments/", assessment);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["assessments"] });
            toast.success("Évaluation créée avec succès");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la création : " + (error.response?.data?.detail || error.message));
        },
    });
};

export const useUpdateGrade = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, score }: { id: string, score: number }) => {
            const response = await apiClient.put<Grade>(`/grades/${id}/`, { score });
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["assessment-grades", data.assessment_id] });
            toast.success("Note mise à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la mise à jour : " + (error.response?.data?.detail || error.message));
        },
    });
};

export const useUpsertGrade = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (grade: Omit<Grade, "id" | "created_at" | "updated_at"> & { id?: string }) => {
            if (grade.id) {
                const response = await apiClient.put<Grade>(`/grades/${grade.id}/`, grade);
                return response.data;
            } else {
                const response = await apiClient.post<Grade>("/grades/", grade);
                return response.data;
            }
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["assessment-grades", data.assessment_id] });
            toast.success("Note enregistrée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'enregistrement : " + (error.response?.data?.detail || error.message));
        },
    });
};
