import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Department {
    id: string;
    tenant_id: string;
    name: string;
    code: string | null;
    description: string | null;
    head_id: string | null;
    created_at?: string;
    updated_at?: string;
}

export const useDepartments = (tenantId?: string) => {
    return useQuery({
        queryKey: ["departments", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Department[]>("/departments/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useCreateDepartment = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (department: Omit<Department, "id">) => {
            const response = await apiClient.post<Department>("/departments/", department);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["departments", data.tenant_id] });
            toast({ title: "Succès", description: "Département créé avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la création du département",
                variant: "destructive",
            });
        },
    });
};

export const useUpdateDepartment = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Department> }) => {
            const response = await apiClient.put<Department>(`/departments/${id}/`, updates);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["departments", data.tenant_id] });
            toast({ title: "Succès", description: "Département mis à jour avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la mise à jour du département",
                variant: "destructive",
            });
        },
    });
};

export const useDeleteDepartment = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
            await apiClient.delete(`/departments/${id}/`);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["departments", variables.tenantId] });
            toast({ title: "Succès", description: "Département supprimé avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression du département",
                variant: "destructive",
            });
        },
    });
};

export const useBulkDeleteDepartments = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ ids, tenantId }: { ids: string[]; tenantId: string }) => {
            await Promise.all(ids.map(id => apiClient.delete(`/departments/${id}/`)));
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["departments", variables.tenantId] });
            toast({ title: "Succès", description: "Départements supprimés avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: "Erreur lors de la suppression en masse des départements",
                variant: "destructive",
            });
        },
    });
};
