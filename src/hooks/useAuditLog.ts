// Supabase import removed - Sovereign architecture migration in progress
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useCallback } from "react";

export type AuditActionType = "CREATE" | "UPDATE" | "DELETE" | "VIEW" | "LOGIN" | "LOGOUT" | "EXPORT";

interface LogParams {
  actionType: AuditActionType;
  entityType?: string;
  entityId?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  dataClassification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SENSITIVE";
  // Legacy support
  tableName?: string;
  recordId?: string;
}

// Utility to generate JSON diff
const generateDiff = (oldValues: Record<string, any> | null, newValues: Record<string, any> | null) => {
  if (!oldValues && !newValues) return { old: null, new: null };
  if (!oldValues) return { old: null, new: newValues };
  if (!newValues) return { old: oldValues, new: null };

  const diff: { old: Record<string, any>; new: Record<string, any> } = { old: {}, new: {} };

  // Find changed fields
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

  allKeys.forEach(key => {
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      diff.old[key] = oldValues[key];
      diff.new[key] = newValues[key];
    }
  });

  return diff;
};

// Utility to get client IP (best effort in browser)
const getClientIP = async (): Promise<string | null> => {
  try {
    // In production, this should come from server-side headers
    // For now, we'll use a placeholder
    return "client-ip-not-available";
  } catch {
    return null;
  }
};

// Utility to get user agent
const getUserAgent = (): string => {
  return navigator.userAgent || "unknown";
};

// Fields to exclude from audit logs (sensitive data)
const EXCLUDED_FIELDS = ['password', 'encrypted_password', 'token', 'secret', 'api_key'];

const sanitizeData = (data: Record<string, any> | null): Record<string, any> | null => {
  if (!data) return null;

  const sanitized = { ...data };
  EXCLUDED_FIELDS.forEach(field => {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  });

  return sanitized;
};

export const useAuditLog = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();

  const log = useCallback(async ({
    actionType,
    entityType,
    entityId,
    oldValues,
    newValues,
    tableName,
    recordId,
    dataClassification
  }: LogParams) => {
    if (!tenant?.id) return;

    try {
      // Sovereign architecture handles critical audit logs on the server side.
      // Optional: Call a sovereign API endpoint for audit if needed in the future
      // await apiClient.post('/audit/logs', { ... })
    } catch (error) {
      console.error("Failed to log audit event:", error);
    }
  }, [tenant?.id, user?.id]);

  const logCreate = useCallback((entityType: string, entityId: string, newValues: Record<string, any>) => {
    return log({ actionType: "CREATE", entityType, entityId, newValues });
  }, [log]);

  const logUpdate = useCallback((
    entityType: string,
    entityId: string,
    oldValues: Record<string, any>,
    newValues: Record<string, any>
  ) => {
    const diff = generateDiff(oldValues, newValues);
    return log({
      actionType: "UPDATE",
      entityType,
      entityId,
      oldValues: diff.old,
      newValues: diff.new
    });
  }, [log]);

  const logDelete = useCallback((entityType: string, entityId: string, oldValues: Record<string, any>) => {
    return log({ actionType: "DELETE", entityType, entityId, oldValues });
  }, [log]);

  const logView = useCallback((entityType: string, entityId: string, dataClassification?: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "SENSITIVE") => {
    return log({ actionType: "VIEW", entityType, entityId, dataClassification });
  }, [log]);

  const logExport = useCallback((entityType: string, recordCount: number) => {
    return log({
      actionType: "EXPORT",
      entityType,
      newValues: { record_count: recordCount },
      dataClassification: "CONFIDENTIAL" // Exports are usually confidential
    });
  }, [log]);

  return {
    log,
    logCreate,
    logUpdate,
    logDelete,
    logView,
    logExport
  };
};
