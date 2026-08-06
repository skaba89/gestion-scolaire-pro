import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

// Mirrors the actual backend Program model/schema exactly (id, tenant_id,
// name, code, description) — a previous version of this file declared
// `degree`/`department_id` fields the API has never returned (Program has
// no such columns), which silently broke any code relying on them.
export interface Program {
    id: string;
    tenant_id: string;
    name: string;
    code?: string | null;
    description?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface ProgramInput {
    name: string;
    code?: string | null;
    description?: string | null;
}

export const usePrograms = (tenantId?: string) => {
    return useQuery({
        queryKey: ["programs", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<Program[]>("/infrastructure/programs/");
            return response.data;
        },
        enabled: !!tenantId,
    });
};

export const useCreateProgram = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (input: ProgramInput) => {
            const response = await apiClient.post<Program>("/infrastructure/programs/", input);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["programs"] });
        },
    });
};

export const useUpdateProgram = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, updates }: { id: string; updates: Partial<ProgramInput> }) => {
            const response = await apiClient.patch<Program>(`/infrastructure/programs/${id}/`, updates);
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["programs"] });
        },
    });
};

export const useDeleteProgram = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: string) => {
            await apiClient.delete(`/infrastructure/programs/${id}/`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["programs"] });
        },
    });
};
