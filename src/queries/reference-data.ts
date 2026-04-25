import { apiClient } from "@/api/client";
import { offlineDb, cacheStudents } from "@/lib/offlineDb";

/**
 * Reference data queries with longer cache times.
 * The `students` query writes through to IndexedDB so offline attendance/grade
 * entry can look up students without a network connection.
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
            try {
                const response = await apiClient.get('/students/', {
                    params: { page_size: 1000 },
                });
                const items: any[] = response.data.items || [];
                // Write through to IndexedDB for offline use (fire-and-forget)
                cacheStudents(
                    tenantId,
                    items.map((s) => ({
                        id: s.id,
                        tenantId,
                        firstName: s.first_name,
                        lastName: s.last_name,
                        registrationNumber: s.registration_number,
                        classroomId: s.current_classroom_id,
                        gender: s.gender,
                        status: s.status,
                    }))
                ).catch(() => undefined);
                return items;
            } catch (err) {
                // Network unavailable — serve from IndexedDB cache
                const cached = await offlineDb.cachedStudents
                    .where("tenantId")
                    .equals(tenantId)
                    .toArray();
                if (cached.length > 0) return cached;
                throw err;
            }
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
