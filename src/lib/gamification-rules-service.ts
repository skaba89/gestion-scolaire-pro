import { apiClient } from "@/api/client";

export interface GamificationRule {
    id: string;
    tenant_id: string;
    name: string;
    description?: string;
    event_type: string;
    conditions: Record<string, any>;
    reward_type: "POINTS" | "BADGE";
    reward_value?: number;
    reward_badge_id?: string;
    is_active: boolean;
    priority: number;
    created_at: string;
    updated_at: string;
}

export interface GamificationEventLog {
    id: string;
    tenant_id: string;
    event_type: string;
    event_id: string;
    student_id: string;
    rules_applied: any[];
    created_at: string;
}

export async function getGamificationRules(
    tenantId: string,
    activeOnly = false
): Promise<GamificationRule[]> {
    const params: Record<string, string> = { tenant_id: tenantId };
    if (activeOnly) params.is_active = "true";

    const { data } = await apiClient.get<GamificationRule[]>("/gamification/rules/", { params });
    return data || [];
}

export async function createGamificationRule(
    rule: Omit<GamificationRule, "id" | "created_at" | "updated_at">
): Promise<GamificationRule> {
    const { data } = await apiClient.post<GamificationRule>("/gamification/rules/", rule);
    return data;
}

export async function updateGamificationRule(
    ruleId: string,
    updates: Partial<GamificationRule>
): Promise<GamificationRule> {
    const { data } = await apiClient.patch<GamificationRule>(`/gamification/rules/${ruleId}/`, updates);
    return data;
}

export async function deleteGamificationRule(ruleId: string): Promise<void> {
    await apiClient.delete(`/gamification/rules/${ruleId}/`);
}

export async function toggleRuleActive(ruleId: string, isActive: boolean): Promise<void> {
    await updateGamificationRule(ruleId, { is_active: isActive });
}

export async function getGamificationEventLogs(
    tenantId: string,
    limit = 100
): Promise<GamificationEventLog[]> {
    const { data } = await apiClient.get<GamificationEventLog[]>("/gamification/event-logs/", {
        params: { tenant_id: tenantId, limit: String(limit) },
    });
    return data || [];
}

export async function triggerGamificationEvent(event: {
    event_type: string;
    event_id: string;
    tenant_id: string;
    student_id: string;
    event_data: Record<string, any>;
}): Promise<any> {
    const { data } = await apiClient.post("/gamification/process-event/", event);
    return data;
}
