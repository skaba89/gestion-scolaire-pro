import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

export interface Program {
    id: string;
    tenant_id: string;
    code: string;
    name: string;
    degree: "LICENCE" | "MASTER" | "DOCTORATE";
    department_id: string;
    created_at?: string;
    updated_at?: string;
}

export const usePrograms = (tenantId?: string, departmentId?: string) => {
    return useQuery({
        queryKey: ["programs", tenantId, departmentId],
        queryFn: async () => {
            if (!tenantId) return [];

            const response = await apiClient.get<Program[]>("/infrastructure/programs/", {
                params: { department_id: departmentId }
            });

            return response.data;
        },
        enabled: !!tenantId,
    });
};
