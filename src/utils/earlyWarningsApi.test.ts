import { afterEach, describe, expect, it } from "vitest";
import type { AxiosAdapter } from "axios";
import { apiClient } from "@/api/client";
import { fetchEarlyWarnings, fetchEarlyWarningHistory, fetchEarlyWarningSummary, fetchEarlyWarningActivePage, updateEarlyWarning, createEarlyWarning, searchEarlyWarningStudents, normalizeEarlyWarningResolutionNotes, paginateEarlyWarningHistory } from "./earlyWarningsApi";

const originalAdapter = apiClient.defaults.adapter;

function mockApi(status: number, data: unknown) {
    const adapter: AxiosAdapter = async (config) => {
        if (status >= 400) {
            return Promise.reject({
                isAxiosError: true,
                config,
                response: { status, data, headers: {}, config },
            });
        }
        return { status, data, config, statusText: "OK", headers: {} };
    };
    apiClient.defaults.adapter = adapter;
}

describe("early warnings API contract", () => {
    afterEach(() => {
        apiClient.defaults.adapter = originalAdapter;
    });

    it("shows a real empty list only for successful HTTP 200", async () => {
        mockApi(200, []);
        await expect(fetchEarlyWarnings()).resolves.toEqual([]);
    });

    it("rejects missing backend route rather than reporting no alerts", async () => {
        mockApi(404, { detail: "Not Found" });
        await expect(fetchEarlyWarnings()).rejects.toBeDefined();
    });

    it("rejects malformed response rather than displaying false counters", async () => {
        mockApi(200, { items: [] });
        await expect(fetchEarlyWarnings()).rejects.toThrow("Format de réponse");
    });

    it("searches students with the real paginated API contract", async () => {
        const calls: Array<{ url?: string; params?: unknown }> = [];
        apiClient.defaults.adapter = async config => {
            calls.push({ url: config.url, params: config.params });
            return {
                status: 200, statusText: "OK", headers: {}, config,
                data: { items: [{ id: "s1", first_name: "A", last_name: "B" }], total: 1 },
            };
        };
        await expect(searchEarlyWarningStudents("  Alpha  ")).resolves.toHaveLength(1);
        expect(calls).toEqual([{
            url: "/students/",
            params: { search: "Alpha", page: 1, page_size: 20 },
        }]);
    });

    it("does not search all students for empty text", async () => {
        apiClient.defaults.adapter = async () => { throw new Error("Unexpected request"); };
        await expect(searchEarlyWarningStudents("  ")).resolves.toEqual([]);
    });

    it("fails closed when student search returns the wrong response contract", async () => {
        mockApi(200, []);
        await expect(searchEarlyWarningStudents("Alpha")).rejects.toThrow("Format de recherche");
    });

    it("posts the exact creation payload without forging identity or timestamps", async () => {
        const calls: Array<{ url?: string; method?: string; data?: unknown }> = [];
        apiClient.defaults.adapter = async config => {
            calls.push({ url: config.url, method: config.method, data: config.data });
            return { status: 201, statusText: "Created", headers: {}, config, data: {} };
        };
        const payload = {
            student_id: "00000000-0000-0000-0000-000000000001" as string,
            alert_type: "academic" as const,
            severity: "high" as const,
            title: "Alerte",
            description: "Résultats en baisse",
            recommended_actions: ["Contacter la famille"],
        };
        await expect(createEarlyWarning(payload)).resolves.toBeUndefined();
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("/school-life/early-warnings/");
        expect(calls[0].method).toBe("post");
        expect(JSON.parse(calls[0].data as string)).toEqual(payload);
    });

    it("propagates failed alert creations without claiming success", async () => {
        mockApi(403, { detail: "Forbidden" });
        await expect(createEarlyWarning({
            student_id: "student-1", alert_type: "attendance", severity: "medium",
            title: "A", description: "B", recommended_actions: [],
        })).rejects.toBeDefined();
    });

    it("requires a real justification for resolving an alert", () => {
        expect(normalizeEarlyWarningResolutionNotes("")).toBeNull();
        expect(normalizeEarlyWarningResolutionNotes("  \t  ")).toBeNull();
        expect(normalizeEarlyWarningResolutionNotes("  Famille contactée  ")).toBe("Famille contactée");
    });

    it("enforces the backend 4000 character resolution limit", () => {
        expect(normalizeEarlyWarningResolutionNotes("x".repeat(4000))).toHaveLength(4000);
        expect(normalizeEarlyWarningResolutionNotes("x".repeat(4001))).toBeNull();
    });

    it("keeps every resolved alert reachable after the first twelve", () => {
        const ids = Array.from({ length: 25 }, (_, i) => i + 1);
        expect(paginateEarlyWarningHistory(ids, 1)).toEqual({
            items: ids.slice(0, 12), page: 1, totalPages: 3,
        });
        expect(paginateEarlyWarningHistory(ids, 2).items).toEqual(ids.slice(12, 24));
        expect(paginateEarlyWarningHistory(ids, 3).items).toEqual([25]);
        expect(paginateEarlyWarningHistory(ids, 9)).toEqual({
            items: [25], page: 3, totalPages: 3,
        });
    });

    it("handles empty resolved history without invalid page state", () => {
        expect(paginateEarlyWarningHistory([], 3)).toEqual({
            items: [], page: 1, totalPages: 1,
        });
    });

    it("requests the combined closed history with bounded server pagination", async () => {
        const calls: Array<{ url?: string; params?: unknown }> = [];
        apiClient.defaults.adapter = async config => {
            calls.push({ url: config.url, params: config.params });
            return {
                status: 200, statusText: "OK", headers: {}, config,
                data: { items: [{ id: "a1", status: "dismissed" }], total: 26, page: 2, page_size: 12, total_pages: 3 },
            };
        };
        const result = await fetchEarlyWarningHistory(2);
        expect(result.total).toBe(26);
        expect(result.items[0].status).toBe("dismissed");
        expect(calls).toEqual([{
            url: "/school-life/early-warnings/paginated/",
            params: { group: "closed", page: 2, page_size: 12 },
        }]);
    });

    it("rejects malformed page response rather than displaying false totals", async () => {
        mockApi(200, { items: [], total: 25, page: 1, page_size: 12 });
        await expect(fetchEarlyWarningHistory(1)).rejects.toThrow("Format de pagination");
    });

    it("does not send invalid pagination parameters to the server", async () => {
        apiClient.defaults.adapter = async () => { throw new Error("Unexpected request"); };
        await expect(fetchEarlyWarningHistory(0)).rejects.toThrow("Paramètres de pagination");
        await expect(fetchEarlyWarningHistory(1, 101)).rejects.toThrow("Paramètres de pagination");
    });

    it("propagates closed history request failure", async () => {
        mockApi(403, { detail: "Forbidden" });
        await expect(fetchEarlyWarningHistory(1)).rejects.toBeDefined();
    });

    it("uses a server summary rather than counting loaded page records", async () => {
        const totals = { total: 31, new: 10, processing: 5, closed: 16,
            resolved: 12, dismissed: 4, academic: 8, critical_new: 3 };
        const calls: string[] = [];
        apiClient.defaults.adapter = async config => {
            calls.push(config.url ?? "");
            return { status: 200, statusText: "OK", headers: {}, config, data: totals };
        };
        await expect(fetchEarlyWarningSummary()).resolves.toEqual(totals);
        expect(calls).toEqual(["/school-life/early-warnings/summary/"]);
    });

    it("rejects inconsistent or incomplete summary totals", async () => {
        mockApi(200, { total: 100, new: 1, processing: 0, closed: 0,
            resolved: 0, dismissed: 0, academic: 0, critical_new: 0 });
        await expect(fetchEarlyWarningSummary()).rejects.toThrow("Format de statistiques");
    });

    it("uses bounded new and processing filters with the correct SQL API contract", async () => {
        const calls: Array<{url?: string; params?: unknown}> = [];
        apiClient.defaults.adapter = async config => {
            calls.push({url: config.url, params: config.params});
            return {status: 200, statusText: "OK", headers: {}, config,
                data: {items: [], total: 26, page: 2, page_size: 12, total_pages: 3}};
        };
        await fetchEarlyWarningActivePage("new", 2);
        await fetchEarlyWarningActivePage("processing", 2);
        expect(calls).toEqual([
            {url: "/school-life/early-warnings/paginated/",
                params: {status: "new", page: 2, page_size: 12}},
            {url: "/school-life/early-warnings/paginated/",
                params: {group: "processing", page: 2, page_size: 12}},
        ]);
    });

    it("rejects active-tab mismatched statuses and malformed totals", async () => {
        mockApi(200, {items: [{id: "1", status: "resolved"}],
            total: 1, page: 1, page_size: 12, total_pages: 1});
        await expect(fetchEarlyWarningActivePage("processing", 1)).rejects.toThrow("Format de pagination");
    });

    it("does not hide server errors as empty active pages", async () => {
        mockApi(403, {detail: "Forbidden"});
        await expect(fetchEarlyWarningActivePage("new", 1)).rejects.toBeDefined();
    });

    it("propagates a failed update so the UI cannot announce success", async () => {
        mockApi(403, { detail: "Forbidden" });
        await expect(updateEarlyWarning("alert-1", { status: "resolved" })).rejects.toBeDefined();
    });
});
