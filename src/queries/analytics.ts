import { apiClient } from "@/api/client";

export const analyticsQueries = {
    revenueTrend: (tenantId: string) => ({
        queryKey: ['analytics', 'revenue-trend', tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data } = await apiClient.get('/analytics/revenue-trend/', {
                params: { months: 6 }
            });
            return data;
        },
        enabled: !!tenantId,
        staleTime: 10 * 60 * 1000,
    }),
    debtAging: (tenantId: string) => ({
        queryKey: ['analytics', 'debt-aging', tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data } = await apiClient.get('/analytics/debt-aging/');
            return data;
        },
        enabled: !!tenantId,
        staleTime: 10 * 60 * 1000,
    }),
    academicStats: (tenantId: string) => ({
        queryKey: ['analytics', 'academic-stats', tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const { data } = await apiClient.get('/analytics/academic-stats/');
            return data;
        },
        enabled: !!tenantId,
        staleTime: 30 * 60 * 1000,
    }),
    studentsAtRisk: (tenantId: string) => ({
        queryKey: ["analytics", "students-at-risk", tenantId],
        queryFn: async () => {
            if (!tenantId) return { students: [], summary: {} };
            const { data } = await apiClient.get('/analytics/students-at-risk/');
            return data;
        },
        enabled: !!tenantId,
        staleTime: 1000 * 60 * 30,
    }),
    revenueByCategory: (tenantId: string) => ({
        queryKey: ["analytics", "revenue-by-category", tenantId],
        queryFn: async () => {
            if (!tenantId) return [];
            const { data } = await apiClient.get('/analytics/revenue-by-category/');
            return data;
        },
        enabled: !!tenantId,
        staleTime: 1000 * 60 * 60,
    }),
};
