import { apiClient } from "@/api/client";

/** Never translate a failed request into an empty alerts list. */
export async function fetchEarlyWarnings(): Promise<any[]> {
    const { data } = await apiClient.get("/school-life/early-warnings/");
    if (!Array.isArray(data)) {
        throw new Error("Format de réponse des alertes invalide");
    }
    return data;
}

export interface PaginatedEarlyWarnings {
    items: any[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

/** Closed history is retrieved in bounded pages, without hiding dismissed alerts. */
export async function fetchEarlyWarningHistory(page: number, pageSize = 12): Promise<PaginatedEarlyWarnings> {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new Error("Paramètres de pagination invalides");
    }
    const { data } = await apiClient.get("/school-life/early-warnings/paginated/", {
        params: { group: "closed", page, page_size: pageSize },
    });
    if (
        !data || !Array.isArray(data.items) ||
        !Number.isInteger(data.total) || data.total < 0 ||
        !Number.isInteger(data.page) || data.page !== page ||
        !Number.isInteger(data.page_size) || data.page_size !== pageSize ||
        !Number.isInteger(data.total_pages) || data.total_pages < 0
    ) {
        throw new Error("Format de pagination des alertes invalide");
    }
    return data;
}

export interface EarlyWarningSummary {
    total: number;
    new: number;
    processing: number;
    closed: number;
    resolved: number;
    dismissed: number;
    academic: number;
    critical_new: number;
}

export async function fetchEarlyWarningSummary(): Promise<EarlyWarningSummary> {
    const { data } = await apiClient.get("/school-life/early-warnings/summary/");
    const keys: Array<keyof EarlyWarningSummary> = [
        "total", "new", "processing", "closed", "resolved",
        "dismissed", "academic", "critical_new",
    ];
    if (!data || keys.some(key => !Number.isSafeInteger(data[key]) || data[key] < 0) ||
        data.new + data.processing + data.closed !== data.total ||
        data.resolved + data.dismissed !== data.closed ||
        data.critical_new > data.new || data.academic > data.total) {
        throw new Error("Format de statistiques des alertes invalide");
    }
    return data;
}

/** Each active tab loads only its own page, not every alert from this school. */
export async function fetchEarlyWarningActivePage(
    group: "new" | "processing",
    page: number,
    pageSize = 12,
): Promise<PaginatedEarlyWarnings> {
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new Error("Paramètres de pagination invalides");
    }
    const params = group === "new"
        ? { status: "new", page, page_size: pageSize }
        : { group: "processing", page, page_size: pageSize };
    const { data } = await apiClient.get("/school-life/early-warnings/paginated/", { params });
    if (!data || !Array.isArray(data.items) ||
        !Number.isSafeInteger(data.total) || data.total < 0 ||
        !Number.isInteger(data.page) || data.page !== page ||
        !Number.isInteger(data.page_size) || data.page_size !== pageSize ||
        !Number.isSafeInteger(data.total_pages) || data.total_pages < 0 ||
        data.total_pages !== Math.ceil(data.total / pageSize) ||
        data.items.length > pageSize ||
        data.items.some((item: any) =>
            !item || (group === "new"
                ? item.status !== "new"
                : !["acknowledged", "in_progress"].includes(item.status)))) {
        throw new Error("Format de pagination des alertes invalide");
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

/** Client-side history pagination without silently hiding older resolved alerts. */
export function paginateEarlyWarningHistory<T>(
    records: T[],
    requestedPage: number,
    pageSize = 12,
): { items: T[]; page: number; totalPages: number } {
    const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
    const page = Math.max(1, Math.min(Math.floor(requestedPage) || 1, totalPages));
    return {
        items: records.slice((page - 1) * pageSize, page * pageSize),
        page,
        totalPages,
    };
}
