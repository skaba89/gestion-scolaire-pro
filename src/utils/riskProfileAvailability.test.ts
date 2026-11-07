import { afterEach, describe, expect, it } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { apiClient } from "@/api/client";
import { riskAssessment } from "./riskAssessment";

const originalAdapter = apiClient.defaults.adapter;

function mockRiskApi(available: boolean) {
    const adapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
        const url = config.url ?? "";
        const data = url === "/students/term-results/"
            ? (available ? { score: 15 } : {})
            : url === "/tenants/tenant-1/"
                ? { settings: { passingScore: 10 } }
                : url === "/terms/"
                    ? []
                    : url === "/terms/term-1/"
                        ? { start_date: "2026-09-01", end_date: "2026-11-30" }
                        : url === "/attendance/stats/"
                            ? { total: 10, present: 10, absent: 0, excused: 0, late: 0 }
                            : url === "/students/grades/"
                                ? (available ? [
                                    { score: 16, max_score: 20 },
                                    { score: 16, max_score: 20 },
                                    { score: 16, max_score: 20 },
                                ] : [])
                                : undefined;
        if (data === undefined) throw new Error("Unexpected API route: " + url);
        return { data, status: 200, statusText: "OK", headers: {}, config };
    };
    apiClient.defaults.adapter = adapter;
}

describe("risk profile data availability", () => {
    afterEach(() => {
        apiClient.defaults.adapter = originalAdapter;
    });

    it("never labels a profile LOW when academic results are unavailable", async () => {
        mockRiskApi(false);
        const result = await riskAssessment.calculateStudentRisk("student-1", "term-1", "tenant-1");
        expect(result.assessment_status).toBe("INCOMPLETE");
        expect(result.risk_level).toBe("UNKNOWN");
        expect(result.risk_score).toBeNull();
        expect(result.factors.find(f => f.category === "Academic Performance")?.available).toBe(false);
    });

    it("preserves the normal LOW rating when every factor has data", async () => {
        mockRiskApi(true);
        const result = await riskAssessment.calculateStudentRisk("student-1", "term-1", "tenant-1");
        expect(result.assessment_status).toBe("COMPLETE");
        expect(result.risk_level).toBe("LOW");
        expect(result.risk_score).toBe(0);
        expect(result.factors).toHaveLength(3);
    });

    it("does not silently ignore absent recent grades", async () => {
        mockRiskApi(true);
        const originalGet = apiClient.defaults.adapter;
        apiClient.defaults.adapter = async (config) => {
            if (config.url === "/students/grades/") {
                return { data: [], status: 200, statusText: "OK", headers: {}, config };
            }
            return (originalGet as AxiosAdapter)(config);
        };
        const result = await riskAssessment.calculateStudentRisk("student-1", "term-1", "tenant-1");
        expect(result.risk_level).toBe("UNKNOWN");
        expect(result.factors.find(f => f.category === "Recent Trend")?.available).toBe(false);
    });
});
