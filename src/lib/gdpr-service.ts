import { apiClient } from "@/api/client";
import { jsPDF } from "jspdf";
import { SentryMonitoring } from "./sentry";

export interface DeletionRequest {
    id: string;
    user_id: string;
    reason: string;
    status: 'PENDING' | 'PROCESSED' | 'CANCELLED' | 'REJECTED';
    requested_at: string;
    processed_at?: string;
    rejection_reason?: string;
    user?: {
        email: string;
        first_name: string;
        last_name: string;
    };
}

export type DeletionAction = 'APPROVE' | 'REJECT';

export const gdprService = {
    /**
     * Export all user data as a JSON file
     */
    async exportUserData(userId: string) {
        try {
            const response = await apiClient.post(`/rgpd/export/`);
            SentryMonitoring.trackDataExport(userId, true);
            return response.data;
        } catch (error) {
            SentryMonitoring.trackDataExport(userId, false);
            console.error("Error exporting data:", error);
            throw new Error("Impossible d'exporter les données.");
        }
    },

    /**
     * Request account deletion (Right to be forgotten)
     */
    async requestDeletion(reason: string): Promise<string> {
        try {
            return await SentryMonitoring.withPerformance('request_account_deletion', 'api', async () => {
                const response = await apiClient.post('/rgpd/requests/', {
                    reason: reason
                });
                return response.data;
            });
        } catch (error: any) {
            SentryMonitoring.trackDatabaseError("request_deletion", "account_deletion_requests", error.message);
            throw error;
        }
    },

    /**
     * Get user's deletion requests
     */
    async getMyDeletionRequests(): Promise<DeletionRequest[]> {
        const response = await apiClient.get('/rgpd/requests/');
        return response.data || [];
    },

    /**
     * Admin: Get all pending deletion requests
     */
    async getPendingRequests(): Promise<DeletionRequest[]> {
        const response = await apiClient.get('/rgpd/requests/');
        // Filter pending locally if the API doesn't have a specific filter, 
        // but our API returns all for admin.
        return (response.data || []).filter((req: DeletionRequest) => req.status === 'PENDING');
    },

    /**
     * Admin: Process a deletion request
     */
    async processRequest(requestId: string, action: DeletionAction, reason?: string): Promise<any> {
        try {
            return await SentryMonitoring.withPerformance('process_account_deletion_request', 'api', async () => {
                const status = action === 'APPROVE' ? 'PROCESSED' : 'REJECTED';
                const response = await apiClient.patch(`/rgpd/requests/${requestId}`, {
                    status: status,
                    rejection_reason: reason
                });
                return response.data;
            });
        } catch (error: any) {
            SentryMonitoring.trackDatabaseError("process_deletion", "account_deletion_requests", error.message);
            throw error;
        }
    },

    /**
     * Admin: Check legal data retention requirements before deletion
     */
    async checkLegalRetention(userId: string): Promise<any> {
        try {
            return await SentryMonitoring.withPerformance('check_legal_data_retention', 'api', async () => {
                const response = await apiClient.get(`/rgpd/check-retention/${userId}`);
                return response.data;
            });
        } catch (error: any) {
            SentryMonitoring.trackDatabaseError("check_retention", "user_data", error.message);
            throw error;
        }
    },

    /**
     * Admin: Get RGPD compliance statistics for the dashboard
     */
    async getStats(): Promise<{
        totalConsents: number;
        anonymizedUsers: number;
        pendingRequests: number;
        complianceRisks: number;
        totalExports: number;
        lastUpdated: string;
    }> {
        try {
            return await SentryMonitoring.withPerformance('get_rgpd_compliance_stats', 'api', async () => {
                const response = await apiClient.get('/rgpd/stats/');
                return response.data;
            });
        } catch (error: any) {
            SentryMonitoring.trackDatabaseError("get_stats", "rgpd_dashboard", error.message);
            throw error;
        }
    },

    /**
     * Trigger the download of the JSON file
     */
    downloadDataAsJson(data: Record<string, unknown>, filename: string = "my-data.json") {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    /**
     * Soft-delete / Anonymize user
     * This usually requires a server-side function to bypass some RLS or handle auth deletion.
     * For Phase 1, we will mark the profile as deleted if we have a flag, or just update PII fields.
     */
    async deleteAccount(userId: string) {
        // Direct deletion is now handled via request approval process for better auditing
        // But if we need a direct admin action:
        try {
            const response = await apiClient.post(`/rgpd/direct-delete/${userId}`);
            return response.data;
        } catch (error: any) {
            SentryMonitoring.trackDatabaseError("delete_account", "profiles", error.message);
            throw error;
        }
    },

    /**
     * Admin: Get all RGPD relevant audit logs for reporting
     */
    async getComplianceAuditLogs() {
        try {
            const response = await apiClient.get('/rgpd/audit-logs/');
            return response.data || [];
        } catch (error) {
            console.error("Error fetching compliance logs:", error);
            throw new Error("Impossible de récupérer les logs de conformité.");
        }
    },

    /**
     * Admin: Generate a formal PDF compliance report
     */
    async generateComplianceReportPDF(logs: any[]) {
        const doc = new jsPDF();
        const now = new Date().toLocaleString();

        // Header
        doc.setFontSize(22);
        doc.setTextColor(0, 51, 102);
        doc.text("Rapport de Conformité RGPD", 20, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le : ${now}`, 20, 30);
        doc.text(`Établissement : SchoolFlow Pro`, 20, 35);

        doc.setDrawColor(0, 51, 102);
        doc.line(20, 40, 190, 40);

        // Summary
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Résumé des activités critiques", 20, 55);

        const stats = {
            exports: logs.filter(l => l.action.includes('export')).length,
            anonymizations: logs.filter(l => l.action.includes('anonymize')).length,
            sensitiveAccess: logs.filter(l => l.severity === 'HIGH').length
        };

        doc.setFontSize(11);
        doc.text(`- Exports de données : ${stats.exports}`, 25, 65);
        doc.text(`- Anonymisations : ${stats.anonymizations}`, 25, 72);
        doc.text(`- Accès aux données sensibles (HIGH) : ${stats.sensitiveAccess}`, 25, 79);

        // Details Table Header
        doc.setFontSize(14);
        doc.text("Détails des logs d'audit", 20, 95);

        doc.setFontSize(9);
        doc.text("Date", 20, 105);
        doc.text("Action", 60, 105);
        doc.text("Table", 100, 105);
        doc.text("Utilisateur", 140, 105);
        doc.line(20, 107, 190, 107);

        // Logs
        let y = 115;
        logs.slice(0, 20).forEach((log) => {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }
            const date = new Date(log.created_at).toLocaleDateString();
            const user = log.profiles ? `${log.profiles.last_name || ''}` : "Système";

            doc.text(date, 20, y);
            doc.text(log.action.substring(0, 20), 60, y);
            doc.text(log.table_name || 'N/A', 100, y);
            doc.text(user, 140, y);
            y += 8;
        });

        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Page ${i} sur ${pageCount} - Document Confidentiel`, 105, 290, { align: "center" });
        }

        doc.save(`rapport-conformite-rgpd-${new Date().toISOString().split('T')[0]}.pdf`);
    }
};
