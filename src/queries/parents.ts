import { apiClient } from "@/api/client";

export const parentQueries = {
    children: (parentId: string) => ({
        queryKey: ["parent-children", parentId] as const,
        queryFn: async () => {
            if (!parentId) return [];
            const response = await apiClient.get<any[]>("/parents/children/");
            return response.data.map(item => ({
                id: item.id,
                is_primary: item.is_primary,
                relationship: item.relationship,
                student_id: item.student_id,
                student: item.student // Backend returns nested student if implemented or we can fetch separate
            }));
        },
        enabled: !!parentId,
    }),
    unpaidInvoices: (studentIds: string[]) => ({
        queryKey: ["parent-unpaid-invoices", studentIds] as const,
        queryFn: async () => {
            if (!studentIds.length) return [];
            // Assuming the backend supports multiple student_ids or we fetch per student
            // For now, let's assume filtering by student_id list or repeated calls
            const response = await apiClient.get<any[]>("/payments/invoices/", {
                params: { status: "PENDING" } // Or filter logic
            });
            // Filter by studentIds on client side for now if backend doesn't support .in_
            return response.data.filter(inv => studentIds.includes(inv.student_id));
        },
        enabled: studentIds.length > 0,
    }),
    invoices: (parentId: string, studentIds: string[], selectedStudentId: string) => ({
        queryKey: ["parent-invoices", parentId, selectedStudentId] as const,
        queryFn: async () => {
            if (!parentId || studentIds.length === 0) return [];

            const params: any = {};
            if (selectedStudentId !== "all") {
                params.student_id = selectedStudentId;
            }

            const response = await apiClient.get<any[]>("/payments/invoices/", { params });
            // If selectedStudentId is 'all', we might need to filter by studentIds on client side
            if (selectedStudentId === "all") {
                return response.data.filter(inv => studentIds.includes(inv.student_id));
            }
            return response.data;
        },
        enabled: !!parentId && studentIds.length > 0,
    }),
    notifications: (userId: string) => ({
        queryKey: ["parent-notifications", userId] as const,
        queryFn: async () => {
            if (!userId) return [];
            const response = await apiClient.get("/notifications/?limit=5");
            return response.data || [];
        },
        enabled: !!userId,
    }),
    unreadMessages: (userId: string) => ({
        queryKey: ["parent-unread-messages", userId] as const,
        queryFn: async () => {
            // TODO: Migrate to communication API in Phase 3
            // For now, this still depends on Supabase/Shim logic
            return 0;
        },
        enabled: !!userId,
    }),
    upcomingEvents: (tenantId: string) => ({
        queryKey: ["parent-upcoming-events", tenantId] as const,
        queryFn: async () => {
            if (!tenantId) return [];
            const response = await apiClient.get<any[]>("/school-life/events/", {
                params: { start_after: new Date().toISOString() }
            });
            return response.data || [];
        },
        enabled: !!tenantId,
    }),
    recentGrades: (studentIds: string[]) => ({
        queryKey: ["parent-recent-grades", studentIds] as const,
        queryFn: async () => {
            if (!studentIds.length) return [];
            const response = await apiClient.get<any[]>("/school-life/grades/");
            // Filter and limit
            return response.data
                .filter(g => studentIds.includes(g.student_id))
                .slice(0, 5);
        },
        enabled: studentIds.length > 0,
    }),
    attendanceAlerts: (studentIds: string[]) => ({
        queryKey: ["parent-attendance-alerts", studentIds] as const,
        queryFn: async () => {
            if (!studentIds.length) return [];
            const response = await apiClient.get<any[]>("/school-life/attendance/", {
                params: { student_ids: studentIds }
            });
            return response.data.filter(a => ["ABSENT", "LATE"].includes(a.status)).slice(0, 5);
        },
        enabled: studentIds.length > 0,
    }),
    grades: (studentIds: string[], selectedStudentId: string) => ({
        queryKey: ["parent-grades", studentIds, selectedStudentId] as const,
        queryFn: async () => {
            if (!studentIds.length) return [];

            const params: any = {};
            if (selectedStudentId !== "all") {
                params.student_id = selectedStudentId;
            }

            const response = await apiClient.get<any[]>("/school-life/grades/", { params });
            if (selectedStudentId === "all") {
                return response.data.filter(g => studentIds.includes(g.student_id));
            }
            return response.data;
        },
        enabled: studentIds.length > 0,
    }),
    childCheckInHistory: (studentId: string) => ({
        queryKey: ["child-check-ins", studentId] as const,
        queryFn: async () => {
            if (!studentId) return [];
            const response = await apiClient.get<any[]>("/school-life/check-ins/", {
                params: { student_ids: [studentId] }
            });
            return response.data;
        },
        enabled: !!studentId,
    }),
    allChildrenCheckInHistory: (studentIds: string[]) => ({
        queryKey: ["all-children-check-ins", studentIds] as const,
        queryFn: async () => {
            if (!studentIds.length) return [];
            const response = await apiClient.get<any[]>("/school-life/check-ins/", {
                params: { student_ids: studentIds }
            });
            return response.data.slice(0, 10);
        },
        enabled: studentIds.length > 0,
    }),
};
