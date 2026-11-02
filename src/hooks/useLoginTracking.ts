/**
 * Sessions et historique des connexions — source de vérité : le serveur.
 *
 * - Sessions : registre serveur (`GET/DELETE /auth/sessions/`). Une session
 *   révoquée est refusée par l'API, y compris au rafraîchissement du jeton.
 * - Historique : événements d'authentification écrits par le serveur
 *   (`GET /audit/?resource_type=AUTH`, réservé à `audit:read`). Le navigateur
 *   n'écrit plus rien : une entrée envoyée par le client serait falsifiable.
 *
 * Les erreurs sont propagées (jamais de liste vide ni de succès simulé) :
 * l'écran affiche un état d'erreur explicite.
 */
import { apiClient } from "@/api/client";

export interface ActiveSession {
  id: string;
  user_id: string;
  browser: string | null;
  os: string | null;
  device_type: "desktop" | "mobile" | "tablet" | null;
  ip_address: string | null;
  created_at: string;
  last_activity_at: string;
  is_current: boolean;
}

export type AuthEventAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "MFA_FAILED"
  | "LOGOUT"
  | "LOGOUT_ALL"
  | "SESSION_REVOKED"
  | "SESSION_EVICTED"
  | "PASSWORD_CHANGED";

export interface AuthEvent {
  id: string;
  action: AuthEventAction | string;
  created_at: string;
  user_id: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  severity: string;
  details: Record<string, unknown> | null;
  /** Identifiant de connexion du compte, quand le serveur l'a consigné. */
  login: string | null;
  success: boolean;
  failure: boolean;
  browser: string | null;
  os: string | null;
  device_type: ActiveSession["device_type"];
}

const FAILURE_ACTIONS = new Set<string>(["LOGIN_FAILED", "MFA_FAILED"]);

/** Même classement que `describe_user_agent` côté serveur (app/core/sessions.py). */
export function describeUserAgent(userAgent: string | null | undefined): {
  browser: string | null;
  os: string | null;
  device_type: ActiveSession["device_type"];
} {
  const ua = (userAgent || "").toLowerCase();
  if (!ua) return { browser: null, os: null, device_type: null };
  let browser = "Autre";
  if (ua.includes("edg/")) browser = "Edge";
  else if (ua.includes("opr/") || ua.includes("opera")) browser = "Opera";
  else if (ua.includes("samsungbrowser")) browser = "Samsung Internet";
  else if (ua.includes("chrome/") && !ua.includes("chromium")) browser = "Chrome";
  else if (ua.includes("firefox/")) browser = "Firefox";
  else if (ua.includes("safari/")) browser = "Safari";
  let os = "Autre";
  if (ua.includes("android")) os = "Android";
  else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios")) os = "iOS";
  else if (ua.includes("windows")) os = "Windows";
  else if (ua.includes("mac os") || ua.includes("macintosh")) os = "macOS";
  else if (ua.includes("linux")) os = "Linux";
  let device_type: ActiveSession["device_type"] = "desktop";
  if (ua.includes("ipad") || ua.includes("tablet")) device_type = "tablet";
  else if (ua.includes("mobile") || ua.includes("iphone")) device_type = "mobile";
  return { browser, os, device_type };
}

interface RawAuditRow {
  id: string;
  action: string;
  created_at: string;
  user_id: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  severity: string | null;
  details: Record<string, unknown> | string | null;
}

function parseDetails(details: RawAuditRow["details"]): Record<string, unknown> | null {
  if (!details) return null;
  if (typeof details === "string") {
    try {
      const parsed: unknown = JSON.parse(details);
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return details;
}

export function toAuthEvent(row: RawAuditRow): AuthEvent {
  const details = parseDetails(row.details);
  const login = typeof details?.login === "string" ? details.login : null;
  return {
    id: row.id,
    action: row.action,
    created_at: row.created_at,
    user_id: row.user_id,
    resource_id: row.resource_id,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    severity: row.severity || "INFO",
    details,
    login,
    success: row.action === "LOGIN_SUCCESS",
    failure: FAILURE_ACTIONS.has(row.action),
    ...describeUserAgent(row.user_agent),
  };
}

/** Événements d'authentification de l'établissement, les plus récents d'abord. */
export async function getAuthHistory(): Promise<AuthEvent[]> {
  const { data } = await apiClient.get<RawAuditRow[]>("/audit/", {
    params: { resource_type: "AUTH", page_size: 100 },
  });
  return (Array.isArray(data) ? data : []).map(toAuthEvent);
}

/** Appareils connectés au compte courant. */
export async function getActiveSessions(): Promise<ActiveSession[]> {
  const { data } = await apiClient.get<ActiveSession[]>("/auth/sessions/");
  return data;
}

/** Révoque une session du compte courant ; rejette si le serveur refuse. */
export async function terminateSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/auth/sessions/${encodeURIComponent(sessionId)}/`);
}
