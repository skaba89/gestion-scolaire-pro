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

export interface ChatResponse {
  response: string;
  conversation_id?: string;
}

export interface AuditRequest {
  module_description: string;
  data: Record<string, unknown>;
  stream?: boolean;
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
 */
export async function chatWithAI(
  message: string,
  conversationHistory?: ChatMessage[],
): Promise<ChatResponse> {
  const payload: ChatRequest = { message };

  if (conversationHistory && conversationHistory.length > 0) {
    payload.history = conversationHistory;
  }

  const { data } = await apiClient.post<ChatResponse>("/ai/chat", payload);
  return data;
}

/**
 * Send module data to the Groq AI audit endpoint for analysis.
 */
export async function auditModule(
  module: string,
  data: Record<string, unknown>,
): Promise<AuditResponse> {
  const payload: AuditRequest = { module_description: module, data };
  const { data: result } = await apiClient.post<AuditResponse>("/ai/audit", payload);
  return result;
}
