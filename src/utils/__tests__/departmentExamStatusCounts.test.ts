import { describe, expect, it } from "vitest";
import { buildDepartmentExamStatusCounts as summarize } from "../departmentExamStatusCounts";

describe("department exam status contract", () => {
  it("counts statuses from an unpaginated API response", () => {
    expect(summarize([
      { status: "scheduled" },
      { status: "scheduled" },
      { status: "completed" },
      { status: "cancelled" },
    ]).map(item => item.value)).toEqual([2, 1, 1]);
  });

  it("accepts a paginated items response", () => {
    expect(summarize({ items: [{ status: "completed" }] }).map(item => item.value)).toEqual([0, 1, 0]);
  });

  it("keeps empty, successful responses distinct from API errors", () => {
    expect(summarize([]).every(item => item.value === 0)).toBe(true);
    expect(() => summarize(null)).toThrow("Réponse des examens non conforme");
    expect(() => summarize({ data: null })).toThrow("Réponse des examens non conforme");
  });

  it("ignores unknown statuses without incrementing a category", () => {
    expect(summarize([{ status: "draft" }, {}, null]).map(item => item.value)).toEqual([0, 0, 0]);
  });
  it("reads the real department portal {exams} response and filters by calendar month", () => {
    const response = { department: { id: "department-a" }, exams: [
      { status: "scheduled", exam_date: "2026-11-01" },
      { status: "completed", exam_date: "2026-11-30" },
      { status: "cancelled", exam_date: "2026-10-31" },
      { status: "scheduled", exam_date: "2026-12-01" },
      { status: "completed", exam_date: null },
    ], classrooms: [], subjects: [], terms: [] };
    expect(summarize(response, "2026-11-01", "2026-11-30").map(item => item.value)).toEqual([1, 1, 0]);
  });

  it("reports malformed {exams} payloads instead of displaying zeroes", () => {
    expect(() => summarize({ exams: null }, "2026-11-01", "2026-11-30")).toThrow("Réponse des examens non conforme");
  });

  it("treats an empty but valid month as zero exams", () => {
    expect(summarize({
      exams: [{ status: "scheduled", exam_date: "2026-10-10" }],
    }, "2026-11-01", "2026-11-30").map(item => item.value)).toEqual([0, 0, 0]);
  });

});
