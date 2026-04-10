import { apiClient } from "@/api/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface AuditLog {
    id: string;
    tenant_id: string;
    user_id: string | null;
    action: string;
    action_type: "CREATE" | "UPDATE" | "DELETE" | "VIEW" | "LOGIN" | "LOGOUT" | "EXPORT";
    entity_type: string | null;
    entity_id: string | null;
    table_name: string | null;
    record_id: string | null;
    old_values: Record<string, any> | null;
    new_values: Record<string, any> | null;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
    user?: {
        id: string;
        first_name: string;
        last_name: string;
        email: string;
    };
}

export interface AuditLogFilters {
    userId?: string;
    actionType?: string;
    entityType?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
}

export const auditLogQueries = {
    all: (tenantId: string, filters?: AuditLogFilters, page: number = 1, pageSize: number = 50) => ({
        queryKey: ["audit_logs", tenantId, filters, page, pageSize],
        queryFn: async () => {
            const response = await apiClient.get<AuditLog[]>("/audit/", {
                params: {
                    page,
                    page_size: pageSize,
                    user_id: filters?.userId,
                    action_type: filters?.actionType,
                    entity_type: filters?.entityType,
                }
            });

            // Note: Total count might need an addition to backend response
            const total = response.data.length; // Placeholder
            return {
                logs: response.data,
                total: total || 0,
                page,
                pageSize,
                totalPages: Math.ceil((total || 0) / pageSize),
            };
        },
    }),

    byEntity: (entityType: string, entityId: string) => ({
        queryKey: ["audit_logs", "entity", entityType, entityId],
        queryFn: async () => {
            const response = await apiClient.get<AuditLog[]>("/audit/", {
                params: { entity_type: entityType, entity_id: entityId }
            });
            return response.data;
        },
    }),

    byUser: (userId: string, limit: number = 100) => ({
        queryKey: ["audit_logs", "user", userId, limit],
        queryFn: async () => {
            const response = await apiClient.get<AuditLog[]>("/audit/", {
                params: { user_id: userId, page_size: limit }
            });
            return response.data;
        },
    }),
};

export const useAuditLogs = (
    tenantId: string,
    filters?: AuditLogFilters,
    page: number = 1,
    pageSize: number = 50
) => {
    return useQuery(auditLogQueries.all(tenantId, filters, page, pageSize));
};

export const useEntityAuditLogs = (entityType: string, entityId: string) => {
    return useQuery(auditLogQueries.byEntity(entityType, entityId));
};

export const useUserAuditLogs = (userId: string, limit?: number) => {
    return useQuery(auditLogQueries.byUser(userId, limit));
};

// Export audit logs to CSV
export const useExportAuditLogs = () => {
    return useMutation({
        mutationFn: async ({ logs }: { logs: AuditLog[] }) => {
            const csvHeaders = [
                "Date",
                "User",
                "Action",
                "Entity Type",
                "Entity ID",
                "IP Address",
                "Changes",
            ].join(";");

            const csvRows = logs.map((log) => {
                const date = new Date(log.created_at).toLocaleString();
                const user = log.user
                    ? `${log.user.first_name} ${log.user.last_name}`
                    : "System";
                const action = log.action_type || log.action;
                const entityType = log.entity_type || log.table_name || "-";
                const entityId = log.entity_id || log.record_id || "-";
                const ipAddress = log.ip_address || "-";

                // Simplified changes summary
                let changes = "-";
                if (log.action_type === "UPDATE" && log.old_values && log.new_values) {
                    const changedFields = Object.keys(log.new_values).join(", ");
                    changes = `Changed: ${changedFields}`;
                }

                return [date, user, action, entityType, entityId, ipAddress, changes]
                    .map((field) => {
                        const str = String(field);
                        return str.includes(";") || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
                    })
                    .join(";");
            });

            const csv = [csvHeaders, ...csvRows].join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `audit-logs-${new Date().toISOString()}.csv`;
            link.click();
            URL.revokeObjectURL(url);

            toast.success("Audit logs exported successfully");
        },
        onError: (error: any) => {
            toast.error("Failed to export audit logs: " + error.message);
        },
    });
};
