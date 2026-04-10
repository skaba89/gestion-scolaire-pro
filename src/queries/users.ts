import { apiClient } from "@/api/client";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppRole } from "@/lib/types";
export type { AppRole };

export interface UserWithRoles {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean | null;
    roles: AppRole[];
    avatar_url?: string | null;
    created_at: string | null;
}

export const userQueries = {
    all: (tenantId: string, options?: { page?: number; pageSize?: number; role?: string; search?: string }) => ({
        queryKey: ["users", tenantId, options] as const,
        queryFn: async () => {
            if (!tenantId) return { users: [], totalCount: 0 };

            const response = await apiClient.get("/users/", {
                params: {
                    page: options?.page,
                    page_size: options?.pageSize,
                    role: options?.role !== "all" ? options?.role : undefined,
                    search: options?.search
                }
            });

            // The backend returns a paginated object: { items: [], total: ... }
            return {
                users: response.data.items as UserWithRoles[] || [],
                totalCount: response.data.total || 0
            };
        },
        enabled: !!tenantId,
    }),
    pending: (tenantId: string) => ({
        queryKey: ["users", "pending", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<any[]>("/users/pending/");
            return response.data;
        },
        enabled: !!tenantId,
    }),
};

export const useCreateUser = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (payload: {
            email: string;
            password?: string;
            firstName: string;
            lastName: string;
            role: AppRole;
            tenant: { id: string; name: string; slug: string; logo_url?: string };
        }) => {
            const response = await apiClient.post("/users/", {
                email: payload.email,
                first_name: payload.firstName,
                last_name: payload.lastName,
                password: payload.password || undefined,
                roles: [payload.role]
            });
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
            if (data.generated_password) {
                toast.warning(
                    `Compte créé. Mot de passe temporaire (à communiquer) : ${data.generated_password}`,
                    { duration: 15000 }
                );
            } else {
                toast.success("Compte créé avec succès");
            }
        },
        onError: (error: any) => {
            let errorMessage = error.message || "Impossible de créer le compte";
            if (errorMessage.includes("500")) {
                errorMessage = "Erreur serveur. Vérifiez l'Edge Function.";
            }
            toast.error(errorMessage);
        }
    });
};

export const useUpdateUserStatus = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
            await apiClient.patch(`/users/${userId}/toggle-status/`, { is_active: isActive });
        },
        onMutate: async ({ userId, isActive }) => {
            // Annuler les refetchs en cours pour ne pas écraser notre mise à jour optimiste
            await queryClient.cancelQueries({ queryKey: ["users", tenantId] });

            // Sauvegarder l'état précédent pour le rollback
            const previousUsersData = queryClient.getQueriesData<{ users: UserWithRoles[]; totalCount: number }>({
                queryKey: ["users", tenantId],
            });

            // Mettre à jour optimistiquement tous les caches correspondants
            queryClient.setQueriesData<{ users: UserWithRoles[]; totalCount: number }>(
                { queryKey: ["users", tenantId] },
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        users: old.users.map((u) =>
                            u.id === userId ? { ...u, is_active: isActive } : u
                        ),
                    };
                }
            );

            return { previousUsersData };
        },
        onError: (error: any, __, context) => {
            // Rollback en cas d'erreur
            if (context?.previousUsersData) {
                context.previousUsersData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error("Erreur lors de la mise à jour du statut: " + error.message);
        },
        onSuccess: (_, variables) => {
            toast.success(variables.isActive ? "Utilisateur activé" : "Utilisateur désactivé");
        },
        onSettled: () => {
            // Toujours refetch pour s'assurer de la cohérence avec le serveur
            queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
        },
    });
};

export const useDeleteUserAccount = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (userId: string) => {
            await apiClient.delete(`/users/${userId}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
            toast.success("Compte utilisateur supprimé définitivement");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la suppression: " + error.message);
        }
    });
};

export const useAddRole = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
            // Get current user to have all roles
            const { data: user } = await apiClient.get<UserWithRoles>(`/users/${userId}/`);
            const newRoles = Array.from(new Set([...user.roles, role]));
            await apiClient.put(`/users/${userId}/roles/`, { roles: newRoles });
        },
        onMutate: async ({ userId, role }) => {
            await queryClient.cancelQueries({ queryKey: ["users", tenantId] });
            const previousUsersData = queryClient.getQueriesData<{ users: UserWithRoles[]; totalCount: number }>({
                queryKey: ["users", tenantId],
            });

            queryClient.setQueriesData<{ users: UserWithRoles[]; totalCount: number }>(
                { queryKey: ["users", tenantId] },
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        users: old.users.map((u) =>
                            u.id === userId ? { ...u, roles: [...u.roles, role] } : u
                        ),
                    };
                }
            );

            return { previousUsersData };
        },
        onError: (error: any, __, context) => {
            if (context?.previousUsersData) {
                context.previousUsersData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error(error.message || "Erreur lors de l'ajout du rôle");
        },
        onSuccess: (_, variables) => {
            toast.success(`Rôle ${variables.role} ajouté`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
        }
    });
};

export const useRemoveRole = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
            const { data: user } = await apiClient.get<UserWithRoles>(`/users/${userId}/`);
            const newRoles = user.roles.filter(r => r !== role);
            await apiClient.put(`/users/${userId}/roles/`, { roles: newRoles });
        },
        onMutate: async ({ userId, role }) => {
            await queryClient.cancelQueries({ queryKey: ["users", tenantId] });
            const previousUsersData = queryClient.getQueriesData<{ users: UserWithRoles[]; totalCount: number }>({
                queryKey: ["users", tenantId],
            });

            queryClient.setQueriesData<{ users: UserWithRoles[]; totalCount: number }>(
                { queryKey: ["users", tenantId] },
                (old) => {
                    if (!old) return old;
                    return {
                        ...old,
                        users: old.users.map((u) =>
                            u.id === userId ? { ...u, roles: u.roles.filter(r => r !== role) } : u
                        ),
                    };
                }
            );

            return { previousUsersData };
        },
        onError: (error: any, __, context) => {
            if (context?.previousUsersData) {
                context.previousUsersData.forEach(([queryKey, data]) => {
                    queryClient.setQueryData(queryKey, data);
                });
            }
            toast.error("Erreur lors de la suppression du rôle: " + error.message);
        },
        onSuccess: (_, variables) => {
            toast.success(`Rôle ${variables.role} supprimé`);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
        }
    });
};

export const useUpdateUser = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ userId, data }: { userId: string; data: { first_name?: string; last_name?: string; email?: string } }) => {
            const response = await apiClient.patch(`/users/${userId}/`, data);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
            toast.success("Utilisateur mis à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la mise à jour: " + (error.response?.data?.detail || error.message));
        }
    });
};

export const useTenantSecuritySettings = (tenantId: string) => {
    return useQuery({
        queryKey: ["tenant-security-settings", tenantId],
        queryFn: async () => {
            if (!tenantId) return null;
            const response = await apiClient.get("/tenants/security-settings/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useUpdateSecuritySettings = (tenant_id: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (settings: any) => {
            const response = await apiClient.patch("/tenants/security-settings/", settings);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["tenant-security-settings", tenant_id] });
            toast.success("Paramètres de sécurité mis à jour");
        },
        onError: (error: any) => {
            toast.error("Erreur mise à jour sécurité: " + error.message);
        }
    });
};

export const useConvertToAccount = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            user,
            tenant,
            generatedPassword
        }: {
            user: { id: string; first_name: string; last_name: string; email: string; type: 'student' | 'parent' };
            tenant: { id: string; name: string; slug: string; logo_url?: string | null };
            generatedPassword: string;
        }) => {
            const response = await apiClient.post("/users/convert/", {
                id: user.id,
                email: user.email,
                first_name: user.first_name,
                last_name: user.last_name,
                type: user.type,
                password: generatedPassword
            });
            return { ...response.data, generatedPassword };
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
            queryClient.invalidateQueries({ queryKey: ["users", "pending", tenantId] });
            // Use the backend-returned generated_password if available, else the one we sent
            const password = data.generated_password || data.generatedPassword;
            toast.success(`Compte créé. Mot de passe temporaire : ${password}`, {
                duration: 15000
            });
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la création du compte: " + error.message);
        }
    });
};

export const useDeletePendingUser = (tenantId: string) => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ id, type }: { id: string; type: 'student' | 'parent' }) => {
            const endpoint = type === 'student' ? `/students/${id}/` : `/parents/${id}/`;
            await apiClient.delete(endpoint);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["users", "pending", tenantId] });
            toast.success("Fiche supprimée");
        },
        onError: (error: any) => {
            toast.error("Erreur lors de la suppression: " + error.message);
        }
    });
};
