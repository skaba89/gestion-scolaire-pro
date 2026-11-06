import { describe, expect, it } from "vitest";
import { buildDepartmentGradeDistribution as aggregate } from "../departmentGradeDistribution";

describe("department grade distribution", () => {
  it("normalizes every grade with its actual max_score", () => {
    const result = aggregate([
      { score: 8, max_score: 10 },  // 16/20
      { score: 14, max_score: 20 }, // 14/20
      { score: 6, max_score: 10 },  // 12/20
      { score: 5, max_score: 10 },  // 10/20
      { score: 4, max_score: 10 },  // 8/20
    ]);
    expect(result.map(bucket => bucket.value)).toEqual([1, 1, 1, 1, 1]);
  });

  it("does not count invalid values or zero/negative max_score", () => {
    expect(aggregate([
      { score: 8, max_score: 0 },
      { score: -1, max_score: 20 },
      { score: 25, max_score: 20 },
      { score: Number.NaN, max_score: 20 },
      { score: 15, max_score: Number.POSITIVE_INFINITY },
    ]).every(bucket => bucket.value === 0)).toBe(true);
  });

  it("retains all display buckets when no grades exist", () => {
    const result = aggregate([]);
    expect(result).toHaveLength(5);
    expect(result.every(bucket => bucket.value === 0)).toBe(true);
  });

  it("respects exact category thresholds including full score", () => {
    expect(aggregate([
      { score: 20, max_score: 20 },
      { score: 16, max_score: 20 },
      { score: 13.999, max_score: 20 },
      { score: 9.999, max_score: 20 },
    ]).map(bucket => bucket.value)).toEqual([2, 0, 1, 0, 1]);
  });
});
