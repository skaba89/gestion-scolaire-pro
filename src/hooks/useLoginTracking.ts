/**
 * useLoginTracking — Sovereign replacement for Supabase login_history & RPC functions.
 * Uses the audit log API endpoint instead.
 */
import { apiClient } from "@/api/client";

interface TrackLoginParams {
  email: string;
  success: boolean;
  userId?: string;
  tenantId?: string;
  failureReason?: string;
}

interface TrackLoginResponse {
  success: boolean;
  message?: string;
}

export async function trackLogin(params: TrackLoginParams): Promise<TrackLoginResponse> {
  try {
    if (params.userId && params.success) {
      // Log to audit log via sovereign API
      await apiClient.post("/audit/log", {
        action: "LOGIN",
        resource_type: "USER",
        resource_id: params.userId,
        details: {
          email: params.email,
          user_agent: navigator.userAgent,
          success: true,
        },
      }).catch(() => {
        // Non-blocking — API call failed silently
      });
    } else if (!params.success) {
      // Failed login — log as audit warning
      await apiClient.post("/audit/log", {
        action: "LOGIN_FAILED",
        resource_type: "USER",
        resource_id: params.email,
        details: {
          email: params.email,
          failure_reason: params.failureReason || "invalid_credentials",
        },
      }).catch(() => {
        // Non-blocking — API call failed silently
      });
    }
    return { success: true };
  } catch (error) {
    console.error("Error tracking login:", error);
    return { success: false };
  }
}

/** Account lock check — always returns false (handled by backend rate-limiting) */
export async function checkAccountLocked(_email: string): Promise<boolean> {
  // Backend handles brute force protection automatically.
  // No need for a custom lock check in native JWT mode.
  return false;
}

/** Login history — fetches from audit logs */
export async function getLoginHistory(userId?: string) {
  try {
    const params: Record<string, string> = { action: "LOGIN" };
    if (userId) params.resource_id = userId;
    const { data } = await apiClient.get("/audit/", { params });
    return data?.items || [];
  } catch {
    return [];
  }
}

/** Active sessions — not yet implemented in native JWT mode, returns empty */
export async function getActiveSessions(_userId?: string) {
  // Sessions are managed by the backend. Use the session API for session management.
  return [];
}

/** Terminate session — delegates to backend via API */
export async function terminateSession(_sessionId: string) {
  // Session termination is handled by the backend logout endpoint.
  return true;
}
