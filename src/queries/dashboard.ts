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

            const [academic, financial, admissions] = await Promise.all([
                apiClient.get("/analytics/academic-kpis/").catch((err) => { console.error('[Dashboard] Failed to load academic KPIs:', err); return { data: {} }; }),
                apiClient.get("/analytics/financial-kpis/").catch((err) => { console.error('[Dashboard] Failed to load financial KPIs:', err); return { data: {} }; }),
                apiClient.get("/admissions/stats/").catch((err) => { console.error('[Dashboard] Failed to load admissions stats:', err); return { data: { SUBMITTED: 0, UNDER_REVIEW: 0 } }; }),
            ]);

            return {
                totalStudents: academic.data.totalStudents || 0,
                pendingAdmissions: (admissions.data.SUBMITTED || 0) + (admissions.data.UNDER_REVIEW || 0),
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
            if (!tenantId || !userId) return { pendingHomework: 0 };
            const homework = await apiClient.get("/homework/", { params: { teacher_id: userId, status: "ACTIVE" } })
                .catch(() => ({ data: [] }));
            return {
                pendingHomework: Array.isArray(homework.data) ? homework.data.length : 0,
            };
        },
        staleTime: 5 * 60 * 1000,
    }),
};
