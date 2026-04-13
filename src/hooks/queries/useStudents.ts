import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { useAuditLog } from "@/hooks/useAuditLog";
import { Student } from "@/queries/students";

export const useStudents = (
    tenantId: string,
    showArchived: boolean = false,
    options?: { fields?: string; page?: number; pageSize?: number; search?: string }
) => {
    const queryClient = useQueryClient();
    const { logCreate, logUpdate, logDelete } = useAuditLog();

    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const search = options?.search || "";

    const query = useQuery({
        queryKey: ["students", tenantId, showArchived, options?.fields, page, pageSize, search],
        queryFn: async () => {
            if (!tenantId) return { students: [], totalCount: 0 };
            const { data } = await apiClient.get('/students/', {
                params: {
                    page,
                    page_size: pageSize,
                    search: search || undefined,
                    // Backend uses is_archived flag via status filter
                    status: showArchived ? 'archived' : undefined,
                },
            });
            return {
                students: (data.items ?? []) as Student[],
                totalCount: data.total ?? 0,
            };
        },
        enabled: !!tenantId,
    });

    const archiveMutation = useMutation({
        mutationFn: async ({ id, archived, studentName }: { id: string; archived: boolean; studentName: string }) => {
            await apiClient.put(`/students/${id}/`, { is_archived: archived });
            logUpdate("student", id,
                { is_archived: !archived, name: studentName },
                { is_archived: archived, name: studentName }
            );
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: ["students", tenantId] });
            const previousData = queryClient.getQueryData<{ students: Student[]; totalCount: number }>(
                ["students", tenantId, showArchived, options?.fields, page, pageSize, search]
            );
            queryClient.setQueryData<{ students: Student[]; totalCount: number }>(
                ["students", tenantId, showArchived, options?.fields, page, pageSize, search],
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        students: old.students.filter(s => s.id !== id),
                        totalCount: old.totalCount - 1
                    };
                }
            );
            return { previousData };
        },
        onError: (err: any, _variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(
                    ["students", tenantId, showArchived, options?.fields, page, pageSize, search],
                    context.previousData
                );
            }
            toast.error("Erreur lors de l'archivage: " + err.message);
        },
        onSuccess: () => {
            toast.success("Statut de l'étudiant mis à jour");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async ({ id, studentData }: { id: string; studentData: any }) => {
            await apiClient.delete(`/students/${id}/`);
            logDelete("student", id, studentData);
        },
        onMutate: async ({ id }) => {
            await queryClient.cancelQueries({ queryKey: ["students", tenantId] });
            const previousData = queryClient.getQueryData<{ students: Student[]; totalCount: number }>(
                ["students", tenantId, showArchived, options?.fields, page, pageSize, search]
            );
            queryClient.setQueryData<{ students: Student[]; totalCount: number }>(
                ["students", tenantId, showArchived, options?.fields, page, pageSize, search],
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        students: old.students.filter(s => s.id !== id),
                        totalCount: old.totalCount - 1
                    };
                }
            );
            return { previousData };
        },
        onError: (err: any, _variables, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(
                    ["students", tenantId, showArchived, options?.fields, page, pageSize, search],
                    context.previousData
                );
            }
            toast.error("Erreur destruction: " + err.message);
        },
        onSuccess: () => {
            toast.success("Étudiant supprimé définitivement");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
        }
    });

    const createAccountMutation = useMutation({
        mutationFn: async ({ student, tenant }: { student: Student; tenant: any }) => {
            if (!student.email) {
                throw new Error("Aucun email disponible pour créer un compte");
            }
            const { data } = await apiClient.post('/users/', {
                email: student.email,
                first_name: student.first_name,
                last_name: student.last_name,
                roles: ["STUDENT"],
            });
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["students", tenantId] });
            const message = data?.emailSent
                ? "Compte créé et email envoyé avec succès"
                : "Compte créé avec succès";
            toast.success(message);
        },
        onError: (error: any) => {
            toast.error(error.message || "Erreur lors de la création du compte");
        },
    });

    return {
        students: query.data?.students || [],
        totalCount: query.data?.totalCount || 0,
        isLoading: query.isLoading,
        error: query.error,
        refetch: query.refetch,
        archiveStudent: archiveMutation.mutate,
        isArchiving: archiveMutation.isPending,
        deleteStudent: deleteMutation.mutate,
        isDeleting: deleteMutation.isPending,
        createAccount: createAccountMutation.mutate,
        isCreatingAccount: createAccountMutation.isPending
    };
};
