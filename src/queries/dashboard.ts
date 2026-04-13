import { apiClient } from "@/api/client";

export const dashboardQueries = {
    stats: (tenantId: string) => ({
        queryKey: ['dashboard', 'stats', tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return {
                totalStudents: 0,
                pendingAdmissions: 0,
                pendingInvoices: 0,
                currentAcademicYear: null
            };

            const [academic, financial] = await Promise.all([
                apiClient.get("/analytics/academic-kpis/").catch((err) => { console.error('[Dashboard] Failed to load:', err); return { data: {} }; }),
                apiClient.get("/analytics/financial-kpis/").catch((err) => { console.error('[Dashboard] Failed to load:', err); return { data: {} }; })
            ]);

            return {
                totalStudents: academic.data.totalStudents || 0,
                pendingAdmissions: 0, // TODO: integrate Admissions API
                pendingInvoices: financial.data.pendingRevenue || 0,
                currentAcademicYear: null, // fetched separately via academicYears query
            };
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    }),
    chartData: (tenantId: string) => ({
        queryKey: ['dashboard', 'charts', tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return {
                studentsByLevel: [],
                attendanceStats: [],
                classAverages: []
            };

            const [academicStats, operational] = await Promise.all([
                apiClient.get("/analytics/academic-stats/").catch((err) => { console.error('[Dashboard] Failed to load:', err); return { data: { byClass: [] } }; }),
                apiClient.get("/analytics/operational-kpis/").catch((err) => { console.error('[Dashboard] Failed to load:', err); return { data: {} }; })
            ]);

            const attendanceRate = operational.data.studentAttendanceRate || 0;
            return {
                studentsByLevel: (academicStats.data.byClass || []).map((c: any) => ({
                    name: c.name || c.class_name,
                    count: c.total_students || 0
                })),
                attendanceStats: [
                    { name: 'Présents', value: attendanceRate, percentage: attendanceRate },
                    { name: 'Absents', value: 100 - attendanceRate, percentage: 100 - attendanceRate }
                ],
                classAverages: (academicStats.data.byClass || []).map((c: any) => ({
                    name: c.name || c.class_name,
                    moyenne: c.success_rate || 0
                }))
            };
        },
        staleTime: 10 * 60 * 1000, // 10 minutes
    }),
    teacherStats: (userId: string, tenantId: string) => ({
        queryKey: ['teacher-dashboard', 'stats', userId, tenantId] as const,
        queryFn: async () => {
            // Placeholder for teacher specific stats
            return {
                pendingHomework: 0
            };
        },
        staleTime: 5 * 60 * 1000,
    }),
};
