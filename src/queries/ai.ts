import { apiClient } from "@/api/client";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  stream?: boolean;
}

/**
 * V2 request format — includes tenant context so AI responses
 * use the establishment name instead of the generic platform name.
 */
export interface ChatRequestV2 {
  messages?: ChatMessage[];
  sessionId?: string;
  userContext?: Record<string, unknown>;
  tenantId?: string;
  tenantName?: string;
  userId?: string;
  language?: string;
}

export interface ChatResponse {
  response: string;
  conversation_id?: string;
}

export interface AuditRequest {
  module_description: string;
  data: Record<string, unknown>;
  stream?: boolean;
  platform_name?: string;
}

export interface AuditResponse {
  analysis: string;
  recommendations?: string[];
  score?: number;
}

// ── API Functions ────────────────────────────────────────────────────────────

/**
 * Send a message to the Groq AI chat support endpoint.
 * Maintains conversation history for multi-turn interactions.
 * Uses V2 format with tenant context so AI adapts to the current establishment.
 */
export async function chatWithAI(
  message: string,
  conversationHistory?: ChatMessage[],
  tenantContext?: { tenantId?: string; tenantName?: string; userId?: string; language?: string },
): Promise<ChatResponse> {
  // Build V2 payload with tenant context for branded responses
  const v2Payload: ChatRequestV2 = {};

  // Include tenant context when available
  if (tenantContext) {
    v2Payload.tenantId = tenantContext.tenantId;
    v2Payload.tenantName = tenantContext.tenantName;
    v2Payload.userId = tenantContext.userId;
    v2Payload.language = tenantContext.language || "fr";
  }

  // Build messages array from history + current message
  const messages: ChatMessage[] = [];
  if (conversationHistory && conversationHistory.length > 0) {
    messages.push(...conversationHistory);
  }
  messages.push({ role: "user", content: message });
  v2Payload.messages = messages;

  // If no tenant context, fall back to V1 format
  if (!tenantContext) {
    const v1Payload: ChatRequest = { message };
    if (conversationHistory && conversationHistory.length > 0) {
      v1Payload.history = conversationHistory;
    }
    const { data } = await apiClient.post<ChatResponse>("/ai/chat", v1Payload);
    return data;
  }

  const { data } = await apiClient.post<ChatResponse>("/ai/chat", v2Payload);
  return data;
}

/**
 * Send module data to the Groq AI audit endpoint for analysis.
 * Accepts platform_name so the audit report references the establishment name.
 */
export async function auditModule(
  module: string,
  data: Record<string, unknown>,
  platformName?: string,
): Promise<AuditResponse> {
  const payload: AuditRequest = { module_description: module, data };
  if (platformName) {
    payload.platform_name = platformName;
  }
  const { data: result } = await apiClient.post<AuditResponse>("/ai/audit", payload);
  return result;
}
