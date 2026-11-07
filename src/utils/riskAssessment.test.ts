import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/api/client";
import { riskAssessment } from "./riskAssessment";

// Spy on the same axios instance used by riskAssessment. Avoid replacing the
// whole client module, which breaks other imports in the full Vitest suite.
const get = vi.spyOn(apiClient, "get");

describe("risk assessment academic term API", () => {
    beforeEach(() => get.mockReset());
    afterEach(() => get.mockReset());

    it("loads the actual /terms/{id}/ route for attendance risk", async () => {
        get.mockImplementation(async (url: string) => {
            if (url === "/terms/term-1/") {
                return { data: { start_date: "2026-09-01", end_date: "2026-09-30" } };
            }
            if (url === "/students/attendance/") {
                return { data: [{ status: "ABSENT" }, { status: "PRESENT" }] };
            }
            throw new Error("Unexpected URL: " + url);
        });
        const result = await riskAssessment.calculateAttendanceRisk("student-1", "term-1");
        expect(get).toHaveBeenCalledWith("/terms/term-1/");
        expect(get).toHaveBeenCalledWith("/students/attendance/", {
            params: {
                student_id: "student-1",
                from_date: "2026-09-01",
                to_date: "2026-09-30",
            },
        });
        expect(result.details).toContain("Absences: 50.0%");
    });

    it("loads tenant-scoped /terms/ without unsupported client filters for trends", async () => {
        get.mockImplementation(async (url: string, options?: unknown) => {
            if (url === "/students/term-results/") {
                const term = (options as { params: { term_id: string } }).params.term_id;
                return { data: { score: term === "term-1" ? 12 : 8 } };
            }
            if (url === "/tenants/tenant-1/") {
                return { data: { settings: { passingScore: 10 } } };
            }
            if (url === "/terms/") {
                return { data: [{ id: "term-1" }, { id: "term-0" }] };
            }
            throw new Error("Unexpected URL: " + url);
        });
        const result = await riskAssessment.calculateAcademicRisk("student-1", "term-1", "tenant-1");
        expect(get).toHaveBeenCalledWith("/terms/");
        expect(result.details).toContain("Trend: +4.0");
    });

    it("returns a neutral attendance factor when no term exists", async () => {
        get.mockRejectedValue(new Error("404"));
        const result = await riskAssessment.calculateAttendanceRisk("student-1", "missing");
        expect(result.score).toBe(0);
        expect(result.details).toBe("No term data");
    });
});
