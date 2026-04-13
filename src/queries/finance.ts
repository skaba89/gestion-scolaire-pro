import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";

export const financeQueries = {
    students: (tenantId: string) => ({
        queryKey: ["students-for-invoices", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<any[]>("/students/", {
                params: { is_archived: false }
            });
            // The backend may return { items: [...] } or a direct array
            return response.data?.items || response.data || [];
        },
        enabled: !!tenantId,
    }),
};
