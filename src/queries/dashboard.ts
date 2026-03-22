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
                apiClient.get("/analytics/academic-kpis/").catch(() => ({ data: {} })),
                apiClient.get("/analytics/financial-kpis/").catch(() => ({ data: {} }))
            ]);

            return {
                totalStudents: academic.data.totalStudents || 0,
                pendingAdmissions: 0, // Migrer Admissions API plus tard
                pendingInvoices: financial.data.pendingRevenue || 0,
                currentAcademicYear: academic.data.currentYear || "2024-2025"
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
                apiClient.get("/analytics/academic-stats/").catch(() => ({ data: { byClass: [] } })),
                apiClient.get("/analytics/operational-kpis/").catch(() => ({ data: {} }))
            ]);

            return {
                studentsByLevel: academicStats.data.byClass || [],
                attendanceStats: [
                    { name: 'Présents', value: operational.data.studentAttendanceRate || 0 },
                    { name: 'Absents', value: 100 - (operational.data.studentAttendanceRate || 0) }
                ],
                classAverages: academicStats.data.byClass.map((c: any) => ({
                    subject: c.class_name,
                    average: c.success_rate // Simplified
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
