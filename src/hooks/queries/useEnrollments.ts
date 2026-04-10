import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface Enrollment {
    id: string;
    student_id: string;
    class_id: string | null;
    academic_year_id: string;
    level_id: string | null;
    status: string | null;
    student: {
        id: string;
        first_name: string;
        last_name: string;
        registration_number: string | null;
    };
}

export const useEnrollments = (tenantId: string, academicYearId?: string, classroomId?: string) => {
    const queryClient = useQueryClient();

    const query = useQuery({
        queryKey: ["enrollments", tenantId, academicYearId, classroomId || "all"],
        queryFn: async () => {
            if (!academicYearId) return [];

            const params: Record<string, any> = {
                academic_year_id: academicYearId,
            };

            if (classroomId && classroomId !== "all") {
                params.class_id = classroomId;
            }

            const { data } = await apiClient.get("/enrollments/", { params });
            const results = data?.results ?? data ?? [];

            console.log(`Fetched ${results.length} enrollments for year ${academicYearId}`);
            return results as unknown as Enrollment[];
        },
        enabled: !!tenantId && !!academicYearId,
    });

    const enrollStudents = useMutation({
        mutationFn: async (enrollments: any[]) => {
            await apiClient.post("/enrollments/bulk/", { enrollments });
        },
        onMutate: async (newEnrollments: any[]) => {
            await queryClient.cancelQueries({ queryKey: ["enrollments", tenantId] });
            const previousEnrollments = queryClient.getQueryData<Enrollment[]>(["enrollments", tenantId, academicYearId, classroomId || "all"]);
            return { previousEnrollments };
        },
        onError: (error: any, __, context) => {
            if (context?.previousEnrollments) {
                queryClient.setQueryData(["enrollments", tenantId, academicYearId, classroomId || "all"], context.previousEnrollments);
            }
            toast.error("Erreur lors de l'inscription: " + (error.response?.data?.detail || error.message));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["enrollments", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
            toast.success("Inscriptions réalisées avec succès");
        },
    });

    const removeEnrollment = useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/enrollments/${id}/`);
        },
        onMutate: async (id: string) => {
            await queryClient.cancelQueries({ queryKey: ["enrollments", tenantId] });
            const previousEnrollments = queryClient.getQueryData<Enrollment[]>(["enrollments", tenantId, academicYearId, classroomId || "all"]);

            queryClient.setQueryData<Enrollment[]>(
                ["enrollments", tenantId, academicYearId, classroomId || "all"],
                (old) => {
                    if (!old) return old;
                    return old.filter(e => e.id !== id);
                }
            );

            return { previousEnrollments };
        },
        onError: (error: any, __, context) => {
            if (context?.previousEnrollments) {
                queryClient.setQueryData(["enrollments", tenantId, academicYearId, classroomId || "all"], context.previousEnrollments);
            }
            toast.error("Erreur lors de la suppression: " + (error.response?.data?.detail || error.message));
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["enrollments", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
            toast.success("Inscription supprimée");
        },
    });

    return {
        enrollments: query.data || [],
        isLoading: query.isLoading,
        enrollStudents: enrollStudents.mutateAsync,
        isEnrolling: enrollStudents.isPending,
        removeEnrollment: removeEnrollment.mutateAsync,
        isRemoving: removeEnrollment.isPending,
        refetch: query.refetch
    };
};
