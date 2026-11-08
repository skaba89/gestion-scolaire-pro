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
