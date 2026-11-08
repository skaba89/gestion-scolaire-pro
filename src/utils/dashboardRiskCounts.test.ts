import { describe, expect, it } from "vitest";
import { summarizeDashboardRisks } from "./dashboardRiskCounts";

describe("summarizeDashboardRisks", () => {
    it("separates incomplete and unknown profiles from LOW", () => {
        expect(summarizeDashboardRisks([
            { risk_level: "LOW", risk_score: 3, assessment_status: "COMPLETE" },
            { risk_level: "LOW", risk_score: null, assessment_status: "INCOMPLETE" },
            { risk_level: "UNKNOWN", risk_score: null, assessment_status: "INCOMPLETE" },
            { risk_level: "HIGH", risk_score: 65, assessment_status: "COMPLETE" },
            { risk_level: "CRITICAL", risk_score: 85 },
            { risk_level: "MODERATE", risk_score: 41 },
        ])).toEqual({
            total: 6, low: 1, moderate: 1, high: 1, critical: 1, unknown: 2,
        });
    });

    it("counts malformed/undocumented levels as unknown, without silently ignoring records", () => {
        expect(summarizeDashboardRisks([
            { risk_level: "LOW", risk_score: null },
            { risk_level: "NO_DATA" },
            { risk_level: null },
            null,
        ])).toEqual({
            total: 4, low: 0, moderate: 0, high: 0, critical: 0, unknown: 4,
        });
    });

    it("preserves counts for legacy risk records with no assessment_status", () => {
        expect(summarizeDashboardRisks([
            { risk_level: "LOW" },
            { risk_level: "HIGH" },
        ])).toMatchObject({ low: 1, high: 1, unknown: 0, total: 2 });
    });

    it("returns zero counts for missing or unrecognized response format", () => {
        expect(summarizeDashboardRisks(undefined)).toEqual({
            total: 0, low: 0, moderate: 0, high: 0, critical: 0, unknown: 0,
        });
        expect(summarizeDashboardRisks({ items: [] }).total).toBe(0);
    });
});
