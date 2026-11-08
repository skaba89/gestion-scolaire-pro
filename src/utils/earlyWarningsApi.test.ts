import { afterEach, describe, expect, it } from "vitest";
import type { AxiosAdapter } from "axios";
import { apiClient } from "@/api/client";
import { fetchEarlyWarnings, updateEarlyWarning } from "./earlyWarningsApi";

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

    it("propagates a failed update so the UI cannot announce success", async () => {
        mockApi(403, { detail: "Forbidden" });
        await expect(updateEarlyWarning("alert-1", { status: "resolved" })).rejects.toBeDefined();
    });
});
