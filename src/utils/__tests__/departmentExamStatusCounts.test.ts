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
});
