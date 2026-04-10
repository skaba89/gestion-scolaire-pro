import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

export interface Assessment {
    id: string;
    name: string;
    subject_id: string;
    class_id: string;
    term_id: string;
    type: string;
    max_score: number;
    weight: number;
    date: string;
    subjects?: { name: string };
}

export interface Grade {
    id: string;
    student_id: string;
    assessment_id: string;
    score: number;
    comments: string | null;
}

export const useTeacherGrades = (classroomId?: string, assessmentId?: string) => {
    const { tenant } = useTenant();
    const queryClient = useQueryClient();

    // 1. Fetch Terms
    const termsQuery = useQuery({
        queryKey: ["teacher-terms", tenant?.id],
        queryFn: async () => {
            if (!tenant?.id) return [];
            const { data } = await apiClient.get("/terms/");
            return data?.results ?? data ?? [];
        },
        enabled: !!tenant?.id,
    });

    // 2. Fetch Assessments
    const assessmentsQuery = useQuery({
        queryKey: ["teacher-assessments", tenant?.id, classroomId],
        queryFn: async () => {
            if (!tenant?.id) return [];
            const params: Record<string, any> = {};
            if (classroomId) {
                params.class_id = classroomId;
            }
            const { data } = await apiClient.get("/assessments/", { params });
            return (data?.results ?? data ?? []) as Assessment[];
        },
        enabled: !!tenant?.id,
    });

    // 3. Fetch Grades for an assessment
    const gradesQuery = useQuery({
        queryKey: ["assessment-grades", assessmentId],
        queryFn: async () => {
            if (!assessmentId) return [];
            const { data } = await apiClient.get("/grades/", {
                params: { assessment_id: assessmentId },
            });
            return (data?.results ?? data ?? []) as Grade[];
        },
        enabled: !!assessmentId,
    });

    // 4. Fetch Students for a classroom
    const studentsQuery = useQuery({
        queryKey: ["classroom-students-grades", classroomId],
        queryFn: async () => {
            if (!classroomId) return [];
            const { data } = await apiClient.get("/enrollments/", {
                params: { class_id: classroomId, status: "active" },
            });
            return data?.results ?? data ?? [];
        },
        enabled: !!classroomId,
    });

    // 4. Create Assessment Mutation
    const createAssessment = useMutation({
        mutationFn: async (assessmentData: Omit<Assessment, "id" | "subjects">) => {
            if (!tenant?.id) throw new Error("Tenant missing");
            const { data } = await apiClient.post("/assessments/", {
                ...assessmentData,
                tenant_id: tenant.id,
            });
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["teacher-assessments", tenant?.id] });
            toast.success("Évaluation créée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la création: " + (error.response?.data?.detail || error.message));
        }
    });

    // 5. Save Grade Mutation
    const saveGrade = useMutation({
        mutationFn: async ({
            studentId,
            assessmentId: gradeAssessmentId,
            score,
            comments
        }: {
            studentId: string;
            assessmentId: string;
            score: number;
            comments?: string;
        }) => {
            if (!tenant?.id) throw new Error("Tenant missing");

            // Try to check if grade exists, then update or create
            try {
                const { data: existing } = await apiClient.get("/grades/", {
                    params: { student_id: studentId, assessment_id: gradeAssessmentId },
                });
                const results = existing?.results ?? existing ?? [];
                if (results.length > 0) {
                    await apiClient.put(`/grades/${results[0].id}/`, { score, comments });
                    return;
                }
            } catch {
                // If check fails, try creating directly
            }

            await apiClient.post("/grades/", {
                student_id: studentId,
                assessment_id: gradeAssessmentId,
                score,
                comments,
                tenant_id: tenant.id,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["assessment-grades", assessmentId] });
            toast.success("Note enregistrée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'enregistrement de la note: " + (error.response?.data?.detail || error.message));
        }
    });

    return {
        terms: termsQuery.data || [],
        assessments: assessmentsQuery.data || [],
        grades: gradesQuery.data || [],
        students: studentsQuery.data || [],
        isLoading: termsQuery.isLoading || assessmentsQuery.isLoading || gradesQuery.isLoading || studentsQuery.isLoading,
        createAssessment: createAssessment.mutateAsync,
        isCreating: createAssessment.isPending,
        saveGrade: saveGrade.mutateAsync,
        isSaving: saveGrade.isPending,
    };
};
