import { afterEach, describe, expect, it } from "vitest";
import type { AxiosAdapter } from "axios";
import { apiClient } from "@/api/client";
import { fetchEarlyWarnings, updateEarlyWarning, createEarlyWarning, searchEarlyWarningStudents } from "./earlyWarningsApi";

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

    it("propagates a failed update so the UI cannot announce success", async () => {
        mockApi(403, { detail: "Forbidden" });
        await expect(updateEarlyWarning("alert-1", { status: "resolved" })).rejects.toBeDefined();
    });
});
