import { apiClient } from "@/api/client";
import { toList } from "@/lib/api-list";
import type { Level } from "@/lib/types";

/**
 * Reference data queries with longer cache times.
 * The `students` query writes through to IndexedDB so offline attendance/grade
 * entry can look up students without a network connection.
 */
export const referenceQueries = {
    levels: (tenantId: string) => ({
        queryKey: ['levels', tenantId] as const,
        queryFn: async (): Promise<Level[]> => {
            const response = await apiClient.get('/levels/');
            return toList<Level>(response.data);
        },
        staleTime: 30 * 60 * 1000, // 30 minutes
    }),

    campuses: (tenantId: string) => ({
        queryKey: ['campuses', tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get('/campuses/');
            return response.data || [];
        },
        staleTime: 30 * 60 * 1000,
    }),

    departments: (tenantId: string) => ({
        queryKey: ['departments', tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get('/departments/');
            return response.data || [];
        },
        staleTime: 30 * 60 * 1000,
    }),


    academicYears: (tenantId: string) => ({
        queryKey: ['academic_years', tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get('/academic-years/');
            return response.data || [];
        },
        staleTime: 30 * 60 * 1000,
    }),

    currentAcademicYear: (tenantId: string) => ({
        queryKey: ['academic_years', tenantId, 'current'] as const,
        queryFn: async () => {
            const { data } = await apiClient.get('/academic-years/');
            const list = Array.isArray(data) ? data : (data.items || data.results || []);
            return list.find((ay: any) => ay.is_current) || list[0] || null;
        },
        staleTime: 30 * 60 * 1000,
    }),
};
