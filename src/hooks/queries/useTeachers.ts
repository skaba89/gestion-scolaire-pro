import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";

export interface TeacherProfile {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    is_active: boolean | null;
}

export interface TeacherScheduleSlot {
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    room_name: string | null;
    classrooms: { name: string } | null;
    subjects: { name: string } | null;
}

export const useTeachers = (tenantId: string, options?: { page?: number; pageSize?: number; search?: string }) => {
    const queryClient = useQueryClient();
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const search = options?.search || "";

    const teachersQuery = useQuery({
        queryKey: ["teachers", tenantId, page, pageSize, search],
        queryFn: async () => {
            if (!tenantId) return { teachers: [], totalCount: 0 };

            const { data } = await apiClient.get("/teachers/", {
                params: {
                    page,
                    page_size: pageSize,
                    search,
                    role: "TEACHER",
                },
            });

            const results = data?.results ?? data?.teachers ?? [];
            const totalCount = data?.count ?? data?.totalCount ?? 0;

            return {
                teachers: results as unknown as TeacherProfile[],
                totalCount
            };
        },
        enabled: !!tenantId,
    });

    const addTeacher = useMutation({
        mutationFn: async (formData: { email: string; firstName?: string; lastName?: string; phone?: string }) => {
            if (!tenantId) throw new Error("Tenant manquant");

            try {
                await apiClient.post("/teachers/", {
                    email: formData.email,
                    first_name: formData.firstName || undefined,
                    last_name: formData.lastName || undefined,
                    phone: formData.phone || undefined,
                    tenant_id: tenantId,
                    role: "TEACHER",
                });
            } catch (error: any) {
                const detail = error.response?.data?.detail || error.message;
                if (detail.includes("already") || detail.includes("déjà")) {
                    throw new Error("Cet utilisateur est déjà enseignant");
                }
                if (detail.includes("compte") || detail.includes("account")) {
                    throw new Error("Cet utilisateur doit d'abord créer un compte.");
                }
                throw new Error(detail);
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["teachers", tenantId] });
            toast.success("Enseignant ajouté avec succès");
        },
        onError: (error: Error) => {
            toast.error(error.message);
        },
    });

    const deleteTeacher = useMutation({
        mutationFn: async (teacherId: string) => {
            if (!tenantId) throw new Error("Tenant manquant");

            await apiClient.delete(`/teachers/${teacherId}/`, {
                params: { tenant_id: tenantId, role: "TEACHER" },
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["teachers", tenantId] });
            toast.success("Rôle enseignant supprimé avec succès");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la suppression: " + (error.response?.data?.detail || error.message));
        },
    });

    return {
        teachers: teachersQuery.data?.teachers || [],
        totalCount: teachersQuery.data?.totalCount || 0,
        isLoading: teachersQuery.isLoading,
        addTeacher: addTeacher.mutateAsync,
        isAdding: addTeacher.isPending,
        deleteTeacher: deleteTeacher.mutateAsync,
        isDeleting: deleteTeacher.isPending,
    };
};

export const useTeacherDetails = (teacherId?: string) => {
    return useQuery({
        queryKey: ["teacher-schedule", teacherId],
        queryFn: async () => {
            if (!teacherId) return [];
            const { data } = await apiClient.get(`/teachers/${teacherId}/schedule/`);
            return (data?.results ?? data ?? []) as unknown as TeacherScheduleSlot[];
        },
        enabled: !!teacherId,
    });
};
