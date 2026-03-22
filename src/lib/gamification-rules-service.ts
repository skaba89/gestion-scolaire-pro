import { supabase } from "@/integrations/supabase/client";

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

/**
 * Fetch all gamification rules for a tenant
 */
export async function getGamificationRules(
    tenantId: string,
    activeOnly = false
): Promise<GamificationRule[]> {
    let query = supabase
        .from("gamification_rules")
        .select("*")
        .eq("tenant_id", tenantId);

    if (activeOnly) {
        query = query.eq("is_active", true);
    }

    const { data, error } = await query.order("priority", { ascending: false });

    if (error) {
        console.error("Error fetching gamification rules:", error);
        throw error;
    }

    return data || [];
}

/**
 * Create a new gamification rule
 */
export async function createGamificationRule(
    rule: Omit<GamificationRule, "id" | "created_at" | "updated_at">
): Promise<GamificationRule> {
    const { data, error } = await supabase
        .from("gamification_rules")
        .insert(rule)
        .select()
        .single();

    if (error) {
        console.error("Error creating gamification rule:", error);
        throw error;
    }

    return data;
}

/**
 * Update an existing gamification rule
 */
export async function updateGamificationRule(
    ruleId: string,
    updates: Partial<GamificationRule>
): Promise<GamificationRule> {
    const { data, error } = await supabase
        .from("gamification_rules")
        .update(updates)
        .eq("id", ruleId)
        .select()
        .single();

    if (error) {
        console.error("Error updating gamification rule:", error);
        throw error;
    }

    return data;
}

/**
 * Delete a gamification rule
 */
export async function deleteGamificationRule(ruleId: string): Promise<void> {
    const { error } = await supabase
        .from("gamification_rules")
        .delete()
        .eq("id", ruleId);

    if (error) {
        console.error("Error deleting gamification rule:", error);
        throw error;
    }
}

/**
 * Toggle rule active status
 */
export async function toggleRuleActive(
    ruleId: string,
    isActive: boolean
): Promise<void> {
    await updateGamificationRule(ruleId, { is_active: isActive });
}

/**
 * Fetch event logs for analytics
 */
export async function getGamificationEventLogs(
    tenantId: string,
    limit = 100
): Promise<GamificationEventLog[]> {
    const { data, error } = await supabase
        .from("gamification_event_log")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.error("Error fetching gamification event logs:", error);
        throw error;
    }

    return data || [];
}

/**
 * Trigger gamification event manually (for testing or manual triggers)
 */
export async function triggerGamificationEvent(event: {
    event_type: string;
    event_id: string;
    tenant_id: string;
    student_id: string;
    event_data: Record<string, any>;
}): Promise<any> {
    const { data, error } = await supabase.functions.invoke(
        "process-gamification-event",
        {
            body: event,
        }
    );

    if (error) {
        console.error("Error triggering gamification event:", error);
        throw error;
    }

    return data;
}
