import { apiClient } from "@/api/client";

export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW' | 'LOGIN' | 'LOGOUT' | 'EXPORT';

interface LogAuditParams {
    action: string;
    actionType: AuditActionType;
    entityType?: string;
    entityId?: string;
    details?: Record<string, any>;
    metadata?: Record<string, any>;
    tenantId: string;
}

export const logAudit = async ({
    action,
    actionType,
    entityType,
    entityId,
    details,
    metadata,
    tenantId,
}: LogAuditParams) => {
    try {
        await apiClient.post('/audit/', {
            tenant_id: tenantId,
            action,
            action_type: actionType,
            entity_type: entityType,
            entity_id: entityId,
            details,
            metadata,
        });
    } catch (err) {
        console.error('Exception logging audit event:', err);
    }
};
