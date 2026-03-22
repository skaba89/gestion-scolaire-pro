import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Campus {
    id: string;
    name: string;
    address: string | null;
    phone: string | null;
    is_main: boolean;
    tenant_id: string;
}

export const campusQueries = {
    all: (tenantId: string) => ({
        queryKey: ["campuses", tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get<Campus[]>("/campuses/");
            return response.data;
        },
    }),
};

export const useCreateCampus = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (campus: Omit<Campus, "id">) => {
            const response = await apiClient.post<Campus>("/campuses/", campus);
            return response.data;
        },
        onMutate: async (newCampus) => {
            await queryClient.cancelQueries({ queryKey: ["campuses", newCampus.tenant_id] });
            const previousCampuses = queryClient.getQueryData<Campus[]>(["campuses", newCampus.tenant_id]);

            if (previousCampuses) {
                let updatedPrevious = previousCampuses;
                if (newCampus.is_main) {
                    updatedPrevious = previousCampuses.map(c => ({ ...c, is_main: false }));
                }
                queryClient.setQueryData<Campus[]>(["campuses", newCampus.tenant_id], [
                    { ...newCampus, id: Math.random().toString() } as Campus,
                    ...updatedPrevious,
                ].sort((a, b) => (b.is_main ? 1 : 0) - (a.is_main ? 1 : 0)));
            }

            return { previousCampuses };
        },
        onError: (error: any, newCampus, context) => {
            if (context?.previousCampuses) {
                queryClient.setQueryData(["campuses", newCampus.tenant_id], context.previousCampuses);
            }
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la création du campus",
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Campus créé avec succès" });
        },
        onSettled: (data, error, variables) => {
            queryClient.invalidateQueries({ queryKey: ["campuses", variables.tenant_id] });
        },
    });
};

export const useUpdateCampus = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Campus> & { id: string }) => {
            const response = await apiClient.put<Campus>(`/campuses/${id}/`, updates);
            return response.data;
        },
        onMutate: async (updatedCampus) => {
            const queries = queryClient.getQueryCache().findAll({ queryKey: ["campuses"] });
            const tenantId = queries[0]?.queryKey[1] as string;

            await queryClient.cancelQueries({ queryKey: ["campuses", tenantId] });
            const previousCampuses = queryClient.getQueryData<Campus[]>(["campuses", tenantId]);

            if (previousCampuses) {
                let nextCampuses = previousCampuses.map(c =>
                    c.id === updatedCampus.id ? { ...c, ...updatedCampus } : c
                );

                if (updatedCampus.is_main) {
                    nextCampuses = nextCampuses.map(c =>
                        c.id !== updatedCampus.id ? { ...c, is_main: false } : c
                    );
                }

                queryClient.setQueryData<Campus[]>(["campuses", tenantId], nextCampuses);
            }

            return { previousCampuses, tenantId };
        },
        onError: (error: any, variables, context) => {
            if (context?.previousCampuses) {
                queryClient.setQueryData(["campuses", context.tenantId], context.previousCampuses);
            }
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la mise à jour du campus",
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Campus mis à jour avec succès" });
        },
        onSettled: (data, error, variables, context) => {
            queryClient.invalidateQueries({ queryKey: ["campuses", context?.tenantId] });
        },
    });
};

export const useDeleteCampus = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/campuses/${id}/`);
        },
        onMutate: async (id) => {
            const queries = queryClient.getQueryCache().findAll({ queryKey: ["campuses"] });
            const tenantId = queries[0]?.queryKey[1] as string;

            await queryClient.cancelQueries({ queryKey: ["campuses", tenantId] });
            const previousCampuses = queryClient.getQueryData<Campus[]>(["campuses", tenantId]);

            if (previousCampuses) {
                queryClient.setQueryData<Campus[]>(["campuses", tenantId],
                    previousCampuses.filter(c => c.id !== id)
                );
            }

            return { previousCampuses, tenantId };
        },
        onError: (error: any, id, context) => {
            if (context?.previousCampuses) {
                queryClient.setQueryData(["campuses", context.tenantId], context.previousCampuses);
            }
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression du campus",
                variant: "destructive",
            });
        },
        onSuccess: () => {
            toast({ title: "Succès", description: "Campus supprimé avec succès" });
        },
        onSettled: (data, error, id, context) => {
            queryClient.invalidateQueries({ queryKey: ["campuses", context?.tenantId] });
        },
    });
};
