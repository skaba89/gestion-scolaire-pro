import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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

            let supabaseQuery = supabase
                .from("enrollments")
                .select(`
                    id,
                    student_id,
                    class_id,
                    academic_year_id,
                    level_id,
                    status
                `)
                .eq("tenant_id", tenantId)
                .eq("academic_year_id", academicYearId);

            if (classroomId && classroomId !== "all") {
                supabaseQuery = supabaseQuery.eq("class_id", classroomId);
            }

            const { data: enrollmentsData, error } = await supabaseQuery;

            if (error) {
                console.error("Error fetching enrollments:", error);
                throw error;
            }

            if (!enrollmentsData || enrollmentsData.length === 0) return [];

            // Fetch students data in a separate query to avoid join issues with views
            const studentIds = [...new Set(enrollmentsData.map(e => e.student_id))];

            // Using a resilient query for student data (from 'profiles' but selecting what we need)
            // Most consistent way to get generic student data in this project
            const { data: studentsData, error: studentsError } = await supabase
                .from("students")
                .select("id, first_name, last_name, registration_number")
                .in("id", studentIds);

            if (studentsError) {
                console.error("Error fetching students for join:", studentsError);
                // Return enrollments without student detail if necessary, to avoid total failure
                return enrollmentsData.map(e => ({
                    ...e,
                    student: { id: e.student_id, first_name: "Inconnu", last_name: "", registration_number: null }
                })) as Enrollment[];
            }

            const studentMap = (studentsData || []).reduce((acc: any, student: any) => {
                acc[student.id] = student;
                return acc;
            }, {});

            const mergedData = enrollmentsData.map(e => ({
                ...e,
                student: studentMap[e.student_id] || { id: e.student_id, first_name: "Inconnu", last_name: "", registration_number: null }
            }));

            console.log(`Fetched ${mergedData.length} enrollments for year ${academicYearId}`);
            return mergedData as unknown as Enrollment[];
        },
        enabled: !!tenantId && !!academicYearId,
    });

    const enrollStudents = useMutation({
        mutationFn: async (enrollments: any[]) => {
            const { error } = await supabase
                .from("enrollments")
                .upsert(enrollments, { onConflict: 'student_id,academic_year_id,class_id' });
            if (error) throw error;
        },
        onMutate: async (newEnrollments: any[]) => {
            await queryClient.cancelQueries({ queryKey: ["enrollments", tenantId] });
            const previousEnrollments = queryClient.getQueryData<Enrollment[]>(["enrollments", tenantId, academicYearId, classroomId || "all"]);

            // Optimistically update the list if we are in the classroom view
            if (classroomId && classroomId !== "all") {
                queryClient.setQueryData<Enrollment[]>(
                    ["enrollments", tenantId, academicYearId, classroomId],
                    (old) => {
                        // This is tricky as we don't have the student details yet in the payload
                        // But we can at least invalidate or show a loading state
                        // For simplicity in this complex join case, we'll just invalidate on success
                        // but we could try to mock the data if we had it.
                        return old;
                    }
                );
            }

            return { previousEnrollments };
        },
        onError: (error: any, __, context) => {
            if (context?.previousEnrollments) {
                queryClient.setQueryData(["enrollments", tenantId, academicYearId, classroomId || "all"], context.previousEnrollments);
            }
            toast.error("Erreur lors de l'inscription: " + error.message);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["enrollments", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
            toast.success("Inscriptions réalisées avec succès");
        },
    });

    const removeEnrollment = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("enrollments")
                .delete()
                .eq("id", id);
            if (error) throw error;
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
            toast.error("Erreur lors de la suppression: " + error.message);
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
