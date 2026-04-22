import { apiClient } from "@/api/client";

export const parentsService = {
    async getChildren(parentId: string) {
        if (!parentId) return [];
        const { data } = await apiClient.get<any[]>("/parents/children/", {
            params: { parent_id: parentId },
        });
        return (data || []).map((item: any) => ({
            id: item.id,
            is_primary: item.is_primary,
            relationship: item.relationship,
            student_id: item.student_id,
            student: item.student || item.students || {}
        }));
    },

    async getUnpaidInvoices(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data } = await apiClient.get<any[]>("/invoices/", {
            params: {
                student_id: studentIds.join(","),
                status: "PENDING,PARTIAL,OVERDUE",
            },
        });
        return data || [];
    },

    async getInvoices(studentIds: string[], selectedStudentId?: string) {
        if (studentIds.length === 0) return [];
        const params: Record<string, string> = {};
        if (selectedStudentId && selectedStudentId !== "all") {
            params.student_id = selectedStudentId;
        } else {
            params.student_id = studentIds.join(",");
        }
        const { data } = await apiClient.get<any[]>("/invoices/", { params });
        return data || [];
    },

    async getNotifications(userId: string) {
        if (!userId) return [];
        const { data } = await apiClient.get<any[]>("/notifications/", {
            params: { user_id: userId, is_read: "false", limit: "5" },
        });
        return data || [];
    },

    async getUnreadMessagesCount(userId: string) {
        if (!userId) return 0;
        try {
            const { data } = await apiClient.get<{ count: number }>("/communication/unread-count/", {
                params: { user_id: userId },
            });
            return data?.count || 0;
        } catch {
            return 0;
        }
    },

    async getUpcomingEvents(tenantId: string) {
        if (!tenantId) return [];
        const { data } = await apiClient.get<any[]>("/school-life/events/", {
            params: { tenant_id: tenantId, limit: "5" },
        });
        return data || [];
    },

    async getRecentGrades(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data } = await apiClient.get<any[]>("/grades/", {
            params: {
                student_id: studentIds.join(","),
                limit: "5",
            },
        });
        return data || [];
    },

    async getAttendanceAlerts(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data } = await apiClient.get<any[]>("/attendance/", {
            params: {
                student_id: studentIds.join(","),
                status: "ABSENT,LATE",
                limit: "5",
            },
        });
        return data || [];
    },

    async getChildCheckInHistory(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data } = await apiClient.get<any[]>("/school-life/check-ins/", {
            params: {
                student_id: studentIds.join(","),
                limit: "10",
            },
        });
        return data || [];
    },

    async getGrades(studentIds: string[], selectedStudentId?: string) {
        if (!studentIds.length) return [];
        const params: Record<string, string> = { limit: "100" };
        if (selectedStudentId && selectedStudentId !== "all") {
            params.student_id = selectedStudentId;
        } else {
            params.student_id = studentIds.join(",");
        }
        const { data } = await apiClient.get<any[]>("/grades/", { params });
        return data || [];
    },

    async getStudentDetails(studentId: string) {
        if (!studentId) return null;
        const { data } = await apiClient.get<any>(`/students/${studentId}/`);
        return data;
    },

    async getStudentEnrollment(studentId: string) {
        if (!studentId) return null;
        try {
            const { data } = await apiClient.get<any>(`/students/${studentId}/enrollment/`, {
                params: { status: "active" },
            });
            return data || null;
        } catch {
            return null;
        }
    },

    async getStudentAllGradesDetailed(studentId: string) {
        if (!studentId) return [];
        const { data } = await apiClient.get<any[]>("/grades/", {
            params: { student_id: studentId, detailed: "true" },
        });
        return data || [];
    },

    async getStudentAllEnrollments(studentId: string) {
        if (!studentId) return [];
        const { data } = await apiClient.get<any[]>("/students/enrollments/", {
            params: { student_id: studentId },
        });
        return data || [];
    },

    async getStudentAllAttendance(studentId: string) {
        if (!studentId) return [];
        const { data } = await apiClient.get<any[]>("/attendance/", {
            params: { student_id: studentId },
        });
        return data || [];
    },

    async getChildrenTeachers(userId: string, tenantId: string) {
        if (!userId || !tenantId) return [];
        try {
            const { data } = await apiClient.get<any[]>("/parents/children-teachers/", {
                params: { user_id: userId, tenant_id: tenantId },
            });
            return data || [];
        } catch {
            return [];
        }
    }
};
