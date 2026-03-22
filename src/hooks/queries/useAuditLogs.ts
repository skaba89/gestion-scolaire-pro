import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
            const from = (page - 1) * pageSize;
            const to = from + pageSize - 1;

            let query = supabase
                .from("audit_logs")
                .select(`
          *,
          profiles:user_id (
            email,
            first_name,
            last_name
          )
        `, { count: "exact" })
                .eq("tenant_id", currentTenant.id)
                .order("created_at", { ascending: false })
                .range(from, to);

            if (filters?.action && filters.action !== "all") {
                query = query.eq("action_type", filters.action);
            }

            if (filters?.table && filters.table !== "all") {
                query = query.eq("entity_type", filters.table);
            }

            if (filters?.severity && filters.severity !== "all") {
                query = query.eq("severity", filters.severity);
            }

            if (filters?.startDate) {
                query = query.gte("created_at", `${filters.startDate}T00:00:00`);
            }

            if (filters?.endDate) {
                query = query.lte("created_at", `${filters.endDate}T23:59:59`);
            }

            if (filters?.searchQuery) {
                const search = `%${filters.searchQuery}%`;
                query = query.or(`action.ilike.${search},action_type.ilike.${search},entity_type.ilike.${search}`);
            }

            const { data, error, count } = await query;

            if (error) throw error;

            return {
                logs: (data || []).map((log: any) => ({
                    ...log,
                    user_email: log.profiles?.email,
                    user_name: log.profiles ? `${log.profiles.first_name || ""} ${log.profiles.last_name || ""}`.trim() : undefined,
                })) as AuditLog[],
                totalCount: count || 0
            };
        },
        enabled: !!currentTenant?.id,
        staleTime: 1000 * 60 * 2,
    });
}
