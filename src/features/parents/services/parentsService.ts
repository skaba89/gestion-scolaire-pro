import { apiClient } from "@/api/client";
import { toList } from "@/lib/api-list";

export interface ParentInvoice {
    id: string;
    student_id: string | null;
    invoice_number: string;
    total_amount: number;
    paid_amount: number;
    status: string;
    due_date: string | null;
    [key: string]: unknown;
}

const UNPAID_STATUSES = new Set(["PENDING", "PARTIAL", "OVERDUE"]);

export interface ParentGrade {
    id: string;
    student_id: string;
    score: number | null;
    max_score: number;
    coefficient: number;
    students: { id: string; first_name: string; last_name: string };
    assessments: {
        id: string; name: string; date: string | null; max_score: number; term_id: string | null;
        subjects: { id: string | null; name: string; coefficient: number };
        terms: { id: string; name: string } | null;
    };
}

export const parentsService = {
    async getChildren(parentId: string) {
        if (!parentId) return [];
        const { data } = await apiClient.get<any[]>("/parents/children/", {
            params: { parent_id: parentId },
        });
        return (data || []).map((item: any) => ({
            id: item.id,
            is_primary: item.is_primary,
            relationship: item.relation_type || item.relationship,
            student_id: item.student_id,
            student: item.student || item.students || {}
        }));
    },

    /**
     * Factures des enfants du parent. Le serveur ne renvoie que celles de SES
     * enfants (règle PARENT) : pour « Tous », aucun student_id n'est envoyé.
     * Avant : `student_id=id1,id2` vers l'alias /invoices/ — identifiant
     * invalide, et cet alias ne filtrait pas par famille.
     */
    async getInvoices(studentIds: string[], selectedStudentId?: string) {
        if (studentIds.length === 0) return [];
        const params: Record<string, string | number> = { page_size: 100 };
        if (selectedStudentId && selectedStudentId !== "all") {
            params.student_id = selectedStudentId;
        }
        const { data } = await apiClient.get<unknown>("/payments/invoices/", { params });
        return toList<ParentInvoice>(data);
    },

    async getUnpaidInvoices(studentIds: string[]) {
        const invoices = await this.getInvoices(studentIds);
        return invoices.filter((inv) => UNPAID_STATUSES.has(inv.status));
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
            // Route réelle : /communication/messaging/unread-count/ → { unread }
            // (l'ancienne adresse n'existait pas : toujours 0 message non lu).
            const { data } = await apiClient.get<{ unread: number }>("/communication/messaging/unread-count/");
            return data?.unread || 0;
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
        const { data } = await apiClient.get<any>("/grades/", {
            params: {
                student_id: studentIds.join(","),
                limit: "5",
            },
        });
        return Array.isArray(data) ? data : (data?.items ?? []);
    },

    async getAttendanceAlerts(studentIds: string[]) {
        if (!studentIds.length) return [];
        const { data } = await apiClient.get<any>("/attendance/", {
            params: {
                student_id: studentIds.join(","),
                status: "ABSENT,LATE",
                limit: "5",
            },
        });
        return Array.isArray(data) ? data : (data?.items ?? []);
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

    async getGrades(studentIds: string[], selectedStudentId?: string, termId?: string): Promise<ParentGrade[]> {
        if (!studentIds.length) return [];
        const params: Record<string, string | number> = { page_size: 100 };
        if (selectedStudentId && selectedStudentId !== "all") {
            if (!studentIds.includes(selectedStudentId)) throw new Error("Élève non rattaché à ce compte");
            params.student_id = selectedStudentId;
        }
        if (termId) params.term_id = termId;
        const items: ParentGrade[] = [];
        for (let page = 1; page <= 200; page++) {
            const { data } = await apiClient.get<{ items: ParentGrade[]; page: number; pages: number }>(
                "/parents/grades/", { params: { ...params, page } },
            );
            if (!Array.isArray(data?.items) || data.page !== page || !Number.isInteger(data.pages) || data.pages < page) {
                throw new Error("Réponse de notes invalide");
            }
            if (data.pages > 200) throw new Error("Volume de notes trop important ; sélectionnez un enfant et une période");
            items.push(...data.items);
            if (page === data.pages) return items;
        }
        throw new Error("Volume de notes trop important ; sélectionnez un enfant et une période");
    },

    async generateReportCard(studentId: string, termId: string): Promise<Blob> {
        const { data } = await apiClient.post<Blob>("/parents/report-cards/generate/", {
            student_id: studentId, term_id: termId,
        }, { responseType: "blob" });
        if (data?.type !== "application/pdf" || !data.size) throw new Error("Format de bulletin invalide");
        return data;
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
        const { data } = await apiClient.get<any>("/grades/", {
            params: { student_id: studentId, detailed: "true" },
        });
        return Array.isArray(data) ? data : (data?.items ?? []);
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
        const { data } = await apiClient.get<any>("/attendance/", {
            params: { student_id: studentId },
        });
        return Array.isArray(data) ? data : (data?.items ?? []);
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
