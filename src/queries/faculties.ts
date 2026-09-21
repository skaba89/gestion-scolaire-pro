import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Faculty {
    id: string;
    tenant_id: string;
    name: string;
    code: string | null;
    description: string | null;
    dean_id: string | null;
    created_at?: string;
    updated_at?: string;
}

// Same pattern as src/hooks/queries/use2FA.ts — avoids `any` on the
// mutation's onError handler while still reading FastAPI's `detail` field.
const getErrorDetail = (error: unknown): string | undefined =>
    axios.isAxiosError<{ detail?: string }>(error) ? error.response?.data?.detail : undefined;

export const useFaculties = (tenantId?: string) => {
    return useQuery({
        queryKey: ["faculties", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Faculty[]>("/faculties/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useCreateFaculty = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (faculty: Omit<Faculty, "id">) => {
            const response = await apiClient.post<Faculty>("/faculties/", faculty);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["faculties", data.tenant_id] });
            toast({ title: "Succès", description: "Faculté créée avec succès" });
        },
        onError: (error: unknown) => {
            toast({
                title: "Erreur",
                description: getErrorDetail(error) || "Erreur lors de la création de la faculté",
                variant: "destructive",
            });
        },
    });
};

export const useUpdateFaculty = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<Faculty> }) => {
            const response = await apiClient.put<Faculty>(`/faculties/${id}/`, updates);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["faculties", data.tenant_id] });
            toast({ title: "Succès", description: "Faculté mise à jour avec succès" });
        },
        onError: (error: unknown) => {
            toast({
                title: "Erreur",
                description: getErrorDetail(error) || "Erreur lors de la mise à jour de la faculté",
                variant: "destructive",
            });
        },
    });
};

export const useDeleteFaculty = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id }: { id: string; tenantId: string }) => {
            await apiClient.delete(`/faculties/${id}/`);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["faculties", variables.tenantId] });
            toast({ title: "Succès", description: "Faculté supprimée avec succès" });
        },
        onError: (error: unknown) => {
            toast({
                title: "Erreur",
                description: getErrorDetail(error) || "Erreur lors de la suppression de la faculté",
                variant: "destructive",
            });
        },
    });
};

export const useBulkDeleteFaculties = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ ids }: { ids: string[]; tenantId: string }) => {
            await Promise.all(ids.map(id => apiClient.delete(`/faculties/${id}/`)));
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["faculties", variables.tenantId] });
            toast({ title: "Succès", description: "Facultés supprimées avec succès" });
        },
        onError: () => {
            toast({
                title: "Erreur",
                description: "Erreur lors de la suppression en masse des facultés",
                variant: "destructive",
            });
        },
    });
};
