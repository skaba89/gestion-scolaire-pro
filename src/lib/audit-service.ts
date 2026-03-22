import { supabase } from "@/integrations/supabase/client";

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
        const { error } = await supabase.functions.invoke('log-audit', {
            body: {
                tenant_id: tenantId,
                action,
                action_type: actionType,
                entity_type: entityType,
                entity_id: entityId,
                details,
                metadata,
            },
        });

        if (error) {
            console.error('Failed to log audit event:', error);
        }
    } catch (err) {
        console.error('Exception logging audit event:', err);
    }
};
