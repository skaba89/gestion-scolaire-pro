import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";

export interface AuditLog {
    id: string;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    severity: "INFO" | "WARNING" | "CRITICAL" | null;
    user_id: string | null;
    user_email?: string;
    user_name?: string;
    created_at: string;
    old_values: any;
    new_values: any;
    ip_address: string | null;
    user_agent: string | null;
    action_type?: string;
}

export interface AuditLogsFilters {
    action?: string;
    table?: string;
    severity?: "INFO" | "WARNING" | "CRITICAL" | "all";
    startDate?: string;
    endDate?: string;
    searchQuery?: string;
    page?: number;
    pageSize?: number;
}

export function useAuditLogs(filters?: AuditLogsFilters) {
    const { currentTenant } = useTenant();

    return useQuery({
        queryKey: ["audit-logs", currentTenant?.id, filters],
        queryFn: async () => {
            if (!currentTenant?.id) return { logs: [], totalCount: 0 };

            const page = filters?.page || 1;
            const pageSize = filters?.pageSize || 20;

            const params: Record<string, any> = {
                page,
                page_size: pageSize,
            };

            if (filters?.action && filters.action !== "all") {
                params.action_type = filters.action;
            }

            if (filters?.table && filters.table !== "all") {
                params.entity_type = filters.table;
            }

            if (filters?.severity && filters.severity !== "all") {
                params.severity = filters.severity;
            }

            if (filters?.startDate) {
                params.start_date = `${filters.startDate}T00:00:00`;
            }

            if (filters?.endDate) {
                params.end_date = `${filters.endDate}T23:59:59`;
            }

            if (filters?.searchQuery) {
                params.search = filters.searchQuery;
            }

            const { data } = await apiClient.get("/audit/", { params });

            const results = data?.results ?? data ?? [];
            const totalCount = data?.count ?? data?.totalCount ?? 0;

            return {
                logs: results as AuditLog[],
                totalCount
            };
        },
        enabled: !!currentTenant?.id,
        staleTime: 1000 * 60 * 2,
    });
}
