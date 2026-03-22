import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
            const { data, error } = await supabase
                .from("terms")
                .select("*")
                .eq("tenant_id", tenant.id)
                .order("start_date");
            if (error) throw error;
            return data;
        },
        enabled: !!tenant?.id,
    });

    // 2. Fetch Assessments
    const assessmentsQuery = useQuery({
        queryKey: ["teacher-assessments", tenant?.id, classroomId],
        queryFn: async () => {
            if (!tenant?.id) return [];
            let query = supabase
                .from("assessments")
                .select(`*, subjects (name)`)
                .eq("tenant_id", tenant.id)
                .order("date", { ascending: false });

            if (classroomId) {
                query = query.eq("class_id", classroomId);
            }

            const { data, error } = await query;
            if (error) throw error;
            return data as Assessment[];
        },
        enabled: !!tenant?.id,
    });

    // 3. Fetch Grades for an assessment
    const gradesQuery = useQuery({
        queryKey: ["assessment-grades", assessmentId],
        queryFn: async () => {
            if (!assessmentId) return [];
            const { data, error } = await supabase
                .from("grades")
                .select("*")
                .eq("assessment_id", assessmentId);
            if (error) throw error;
            return data as Grade[];
        },
        enabled: !!assessmentId,
    });

    // 4. Fetch Students for a classroom
    const studentsQuery = useQuery({
        queryKey: ["classroom-students-grades", classroomId],
        queryFn: async () => {
            if (!classroomId) return [];
            const { data, error } = await supabase
                .from("enrollments")
                .select(`
          student_id,
          students (id, first_name, last_name, registration_number)
        `)
                .eq("class_id", classroomId)
                .eq("status", "active");
            if (error) throw error;
            return data;
        },
        enabled: !!classroomId,
    });

    // 4. Create Assessment Mutation
    const createAssessment = useMutation({
        mutationFn: async (assessmentData: Omit<Assessment, "id" | "subjects">) => {
            if (!tenant?.id) throw new Error("Tenant missing");
            const { data, error } = await supabase
                .from("assessments")
                .insert({
                    ...assessmentData,
                    tenant_id: tenant.id,
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["teacher-assessments", tenant?.id] });
            toast.success("Évaluation créée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la création: " + error.message);
        }
    });

    // 5. Save Grade Mutation
    const saveGrade = useMutation({
        mutationFn: async ({
            studentId,
            assessmentId,
            score,
            comments
        }: {
            studentId: string;
            assessmentId: string;
            score: number;
            comments?: string;
        }) => {
            if (!tenant?.id) throw new Error("Tenant missing");

            // Check if grade exists
            const { data: existing } = await supabase
                .from("grades")
                .select("id")
                .eq("student_id", studentId)
                .eq("assessment_id", assessmentId)
                .maybeSingle();

            if (existing) {
                const { error } = await supabase
                    .from("grades")
                    .update({ score, comments })
                    .eq("id", existing.id);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("grades")
                    .insert({
                        student_id: studentId,
                        assessment_id: assessmentId,
                        score,
                        comments,
                        tenant_id: tenant.id,
                    });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["assessment-grades", assessmentId] });
            toast.success("Note enregistrée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'enregistrement de la note: " + error.message);
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
