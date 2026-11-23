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

            // ANALYTICS-ZERO-01 : un indicateur indisponible (503) n'est plus remplacé par des zéros,
            // indiscernables d'un établissement vide : l'erreur remonte et l'écran l'affiche.
            const [academic, financial, admissions] = await Promise.all([
                apiClient.get("/analytics/academic-kpis/"),
                apiClient.get("/analytics/financial-kpis/"),
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

            // ANALYTICS-ZERO-01 : pas de repli silencieux sur des graphiques vides.
            const [academicStats, operational] = await Promise.all([
                apiClient.get("/analytics/academic-stats/"),
                apiClient.get("/analytics/operational-kpis/"),
            ]);

            const attendanceRate = operational.data.studentAttendanceRate || 0;
            return {
                studentsByLevel: (academicStats.data.byClass || []).map((c: any) => ({
                    name: c.name || c.class_name,
                    count: c.total_students || 0
                })),
                attendanceStats: [
                    { key: 'present', name: 'Présents', value: attendanceRate, percentage: attendanceRate },
                    { key: 'absent', name: 'Absents', value: 100 - attendanceRate, percentage: 100 - attendanceRate }
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
