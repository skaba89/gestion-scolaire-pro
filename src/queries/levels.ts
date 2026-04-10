import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Level {
    id: string;
    name: string;
    code?: string | null;
    label?: string | null;
    order_index: number;
}

export const useLevels = (tenantId?: string) => {
    return useQuery({
        queryKey: ["levels", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Level[]>("/levels/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useCreateLevel = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (level: Omit<Level, "id"> & { tenant_id: string }) => {
            const response = await apiClient.post<Level>("/levels/", level);
            return response.data;
        },
        onMutate: async (newLevel) => {
            await queryClient.cancelQueries({ queryKey: ["levels", newLevel.tenant_id] });
            const previousLevels = queryClient.getQueryData<Level[]>(["levels", newLevel.tenant_id]);

            if (previousLevels) {
                queryClient.setQueryData<Level[]>(["levels", newLevel.tenant_id], [
                    ...previousLevels,
                    { ...newLevel, id: Math.random().toString() } as Level,
                ]);
            }

            return { previousLevels };
        },
        onError: (error: any, newLevel, context) => {
            if (context?.previousLevels) {
                queryClient.setQueryData(["levels", newLevel.tenant_id], context.previousLevels);
            }
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la création du niveau",
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Niveau créé avec succès" });
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: ["levels", variables.tenant_id] });
        },
    });
};

export const useUpdateLevel = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Level> & { id: string }) => {
            const response = await apiClient.put<Level>(`/levels/${id}/`, updates);
            return response.data;
        },
        onMutate: async (updatedLevel) => {
            const queries = queryClient.getQueryCache().findAll({ queryKey: ["levels"] });
            const tenantId = queries[0]?.queryKey[1] as string;

            await queryClient.cancelQueries({ queryKey: ["levels", tenantId] });
            const previousLevels = queryClient.getQueryData<Level[]>(["levels", tenantId]);

            if (previousLevels) {
                queryClient.setQueryData<Level[]>(["levels", tenantId],
                    previousLevels.map(l => l.id === updatedLevel.id ? { ...l, ...updatedLevel } : l)
                );
            }

            return { previousLevels, tenantId };
        },
        onError: (error: any, variables, context) => {
            if (context?.previousLevels) {
                queryClient.setQueryData(["levels", context.tenantId], context.previousLevels);
            }
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la mise à jour du niveau",
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Niveau mis à jour avec succès" });
        },
        onSettled: (data, error, variables, context) => {
            queryClient.invalidateQueries({ queryKey: ["levels", context?.tenantId] });
        },
    });
};

export const useDeleteLevel = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/levels/${id}/`);
        },
        onMutate: async (id) => {
            const queries = queryClient.getQueryCache().findAll({ queryKey: ["levels"] });
            const tenantId = queries[0]?.queryKey[1] as string;

            await queryClient.cancelQueries({ queryKey: ["levels", tenantId] });
            const previousLevels = queryClient.getQueryData<Level[]>(["levels", tenantId]);

            if (previousLevels) {
                queryClient.setQueryData<Level[]>(["levels", tenantId],
                    previousLevels.filter(l => l.id !== id)
                );
            }

            return { previousLevels, tenantId };
        },
        onError: (error: any, id, context) => {
            if (context?.previousLevels) {
                queryClient.setQueryData(["levels", context.tenantId], context.previousLevels);
            }
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression du niveau",
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Niveau supprimé avec succès" });
        },
        onSettled: (data, error, id, context) => {
            queryClient.invalidateQueries({ queryKey: ["levels", context?.tenantId] });
        },
    });
};

export const useReorderLevels = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({
            items
        }: {
            items: { id: string; order_index: number }[]
        }) => {
            await Promise.all(
                items.map((item) =>
                    apiClient.put(`/levels/${item.id}/`, { order_index: item.order_index })
                )
            );
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["levels"] });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors du réordonnancement",
                variant: "destructive",
            });
        },
    });
};
