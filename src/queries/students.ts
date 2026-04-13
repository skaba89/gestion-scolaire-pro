import { apiClient } from "@/api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Student } from "@/lib/types";

export const studentQueries = {
    all: (tenantId: string, showArchived: boolean = false) => ({
        queryKey: ["students", tenantId, showArchived] as const,
        queryFn: async () => {
            const response = await apiClient.get("/students/", {
                params: {
                    status: showArchived ? "GRADUATED" : "ACTIVE"
                }
            });
            // Adapt API response to frontend interface
            return (response.data?.items || []) as Student[];
        },
        enabled: !!tenantId,
    }),
    studentProfile: (userId: string, tenantId: string) => ({
        queryKey: ["student-profile", userId, tenantId] as const,
        queryFn: async () => {
            if (!userId || !tenantId) return null;
            const response = await apiClient.get(`/students/${userId}/`);
            return response.data as Student;
        },
        enabled: !!userId && !!tenantId,
    }),
    studentEnrollment: (studentId: string) => ({
        queryKey: ["student-enrollment", studentId] as const,
        queryFn: async () => {
            if (!studentId) return null;
            const response = await apiClient.get(`/students/${studentId}/`);
            // In sovereign API, enrollments might be included or in a sub-resource
            return response.data.enrollment || null;
        },
        enabled: !!studentId,
    }),
};

export const useArchiveStudent = (tenantId: string) => {
    const queryClient = useQueryClient();
    const { logUpdate } = useAuditLog();

    return useMutation({
        mutationFn: async ({ id, archived, studentName }: { id: string; archived: boolean; studentName: string }) => {
            const response = await apiClient.put(`/students/${id}/`, {
                status: archived ? "GRADUATED" : "ACTIVE"
            });

            if (response.status !== 200) throw new Error("Erreur serveur lors de la mise à jour");

            logUpdate("students", id,
                { is_archived: !archived, student: studentName },
                { is_archived: archived, student: studentName }
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
            toast.success("Statut de l'étudiant mis à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de l'archivage: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useDeleteStudent = (tenantId: string) => {
    const queryClient = useQueryClient();
    const { logUpdate } = useAuditLog();

    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/students/${id}/`);
            logUpdate("students", id, { deleted: true }, { deleted: false });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
            toast.success("Étudiant supprimé définitivement");
        },
        onError: (error: any) => {
            toast.error("Erreur destruction: " + (error.response?.data?.detail || error.message));
        }
    });
};

// NOTE: useCreateStudentAccount was removed — the Keycloak sync endpoint
// (`/users/sync-keycloak/{id}/`) no longer exists. Student accounts are now
// created entirely through the native JWT auth flow.
