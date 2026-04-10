import { apiClient } from "@/api/client";

/**
 * Reference data queries with longer cache times
 * These are relatively static data that don't change frequently
 */
export const referenceQueries = {
    levels: (tenantId: string) => ({
        queryKey: ['levels', tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get('/levels/');
            return response.data || [];
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

    students: (tenantId: string) => ({
        queryKey: ['students', tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get('/students/', {
                params: { page_size: 1000 } // Fetch a large batch for reference
            });
            return response.data.items || [];
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
    }),

    teachers: (tenantId: string) => ({
        queryKey: ['teachers', tenantId] as const,
        queryFn: async () => {
            const response = await apiClient.get('/users/', {
                params: { role: 'TEACHER', page_size: 500 }
            });
            return response.data.items || [];
        },
        staleTime: 15 * 60 * 1000, // 15 minutes
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
