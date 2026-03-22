import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useToast } from "@/hooks/use-toast";

export interface Term {
    id: string;
    name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
    academic_year_id: string;
    academic_year?: { name: string };
    tenant_id: string;
}

export const useTerms = (tenantId?: string) => {
    return useQuery({
        queryKey: ["terms", tenantId],
        queryFn: async () => {
            const response = await apiClient.get<Term[]>("/terms/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useCreateTerm = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async (term: Omit<Term, "id" | "academic_year"> & { tenant_id: string }) => {
            const response = await apiClient.post<Term>("/terms/", term);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["terms", data.tenant_id] });
            toast({ title: "Succès", description: "Trimestre créé avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la création du trimestre",
                variant: "destructive",
            });
        },
    });
};

export const useUpdateTerm = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, ...updates }: Partial<Term> & { id: string }) => {
            const response = await apiClient.put<Term>(`/terms/${id}/`, updates);
            return response.data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ["terms", data.tenant_id] });
            toast({ title: "Succès", description: "Trimestre mis à jour avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la mise à jour du trimestre",
                variant: "destructive",
            });
        },
    });
};

export const useDeleteTerm = () => {
    const queryClient = useQueryClient();
    const { toast } = useToast();

    return useMutation({
        mutationFn: async ({ id, tenantId }: { id: string; tenantId: string }) => {
            await apiClient.delete(`/terms/${id}/`);
        },
        onSuccess: (_, variables) => {
            queryClient.invalidateQueries({ queryKey: ["terms", variables.tenantId] });
            toast({ title: "Succès", description: "Trimestre supprimé avec succès" });
        },
        onError: (error: any) => {
            toast({
                title: "Erreur",
                description: error.response?.data?.detail || "Erreur lors de la suppression du trimestre",
                variant: "destructive",
            });
        },
    });
};
