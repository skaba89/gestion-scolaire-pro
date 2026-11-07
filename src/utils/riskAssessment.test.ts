import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { apiClient } from "@/api/client";
import { riskAssessment } from "./riskAssessment";

// Test through the real Axios client with a network-free adapter.
const originalAdapter = apiClient.defaults.adapter;
const requests: Array<{ url?: string; params?: unknown }> = [];

function mockHttp(
    responder: (url: string, config: InternalAxiosRequestConfig) =>
        { status?: number; data: unknown },
) {
    const adapter: AxiosAdapter = async (config) => {
        const url = config.url ?? "";
        requests.push({ url, params: config.params });
        const response = responder(url, config);
        if (response.status && response.status >= 400) {
            return Promise.reject({
                isAxiosError: true,
                config,
                response: {
                    status: response.status,
                    statusText: "Not Found",
                    data: response.data,
                    headers: {},
                    config,
                },
            });
        }
        return {
            data: response.data,
            status: response.status ?? 200,
            statusText: "OK",
            headers: {},
            config,
        };
    };
    apiClient.defaults.adapter = adapter;
}

describe("risk assessment academic term API", () => {
    beforeEach(() => {
        requests.length = 0;
    });

    afterEach(() => {
        apiClient.defaults.adapter = originalAdapter;
    });

    it("loads the actual /terms/{id}/ route for attendance risk", async () => {
        mockHttp((url) => {
            if (url === "/terms/term-1/") {
                return { data: { start_date: "2026-09-01", end_date: "2026-09-30" } };
            }
            if (url === "/students/attendance/") {
                return { data: [{ status: "ABSENT" }, { status: "PRESENT" }] };
            }
            throw new Error("Unexpected URL: " + url);
        });
        const result = await riskAssessment.calculateAttendanceRisk("student-1", "term-1");
        expect(requests).toContainEqual({ url: "/terms/term-1/", params: undefined });
        expect(requests).toContainEqual({
            url: "/students/attendance/",
            params: {
                student_id: "student-1",
                from_date: "2026-09-01",
                to_date: "2026-09-30",
            },
        });
        expect(result.details).toContain("Absences: 50.0%");
    });

    it("loads tenant-scoped /terms/ without unsupported client filters for trends", async () => {
        mockHttp((url, config) => {
            if (url === "/students/term-results/") {
                const term = (config.params as { term_id: string }).term_id;
                return { data: { score: term === "term-1" ? 12 : 8 } };
            }
            if (url === "/tenants/tenant-1/") {
                return { data: { settings: { passingScore: 10 } } };
            }
            if (url === "/terms/") {
                return { data: [{ id: "term-1", academic_year_id: "year-1", start_date: "2026-04-01", end_date: "2026-06-30" }, { id: "term-0", academic_year_id: "year-1", start_date: "2026-01-01", end_date: "2026-03-31" }] };
            }
            throw new Error("Unexpected URL: " + url);
        });
        const result = await riskAssessment.calculateAcademicRisk("student-1", "term-1", "tenant-1");
        expect(requests).toContainEqual({ url: "/terms/", params: undefined });
        expect(result.details).toContain("Trend: +4.0");
    });

    it("returns a neutral attendance factor when no term exists", async () => {
        mockHttp(() => ({ status: 404, data: { detail: "Not found" } }));
        const result = await riskAssessment.calculateAttendanceRisk("student-1", "missing");
        expect(result.score).toBe(0);
        expect(result.details).toBe("No term data");
        expect(requests).toHaveLength(1);
    });
});
