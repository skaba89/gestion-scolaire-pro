import { apiClient } from "@/api/client";

/** Never translate a failed request into an empty alerts list. */
export async function fetchEarlyWarnings(): Promise<any[]> {
    const { data } = await apiClient.get("/school-life/early-warnings/");
    if (!Array.isArray(data)) {
        throw new Error("Format de réponse des alertes invalide");
    }
    return data;
}

export async function updateEarlyWarning(
    id: string,
    updates: Record<string, unknown>,
): Promise<void> {
    await apiClient.put(`/school-life/early-warnings/${id}/`, updates);
}

export interface EarlyWarningCreatePayload {
    student_id: string;
    alert_type: "academic" | "attendance" | "behavior" | "engagement" | "wellbeing";
    severity: "low" | "medium" | "high" | "critical";
    title: string;
    description: string;
    recommended_actions: string[];
}

export async function createEarlyWarning(payload: EarlyWarningCreatePayload): Promise<void> {
    await apiClient.post("/school-life/early-warnings/", payload);
}

export interface EarlyWarningStudent {
    id: string;
    first_name: string;
    last_name: string;
    registration_number?: string;
}

export async function searchEarlyWarningStudents(search: string): Promise<EarlyWarningStudent[]> {
    if (!search.trim()) return [];
    const { data } = await apiClient.get("/students/", {
        params: { search: search.trim(), page: 1, page_size: 20 },
    });
    if (!data || !Array.isArray(data.items)) {
        throw new Error("Format de recherche des élèves invalide");
    }
    return data.items;
}

/** Resolution requires an actual explanation; mirror the backend's 4,000-char limit. */
export function normalizeEarlyWarningResolutionNotes(value: string): string | null {
    const notes = value.trim();
    return notes.length > 0 && notes.length <= 4000 ? notes : null;
}
