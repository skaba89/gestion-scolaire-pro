import { beforeEach, describe, expect, it, vi } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/api/client", () => ({
  apiClient: { post, get: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

import { gradesService } from "../services/gradesService";

const grades = [
  { student_id: "student-1", assessment_id: "assessment-1", score: 15 },
  { student_id: "student-2", assessment_id: "assessment-1", score: 12 },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("gradesService bulk-create contract", () => {
  it("returns the grades from the real backend bulk response", async () => {
    const inserted = [{ id: "grade-1", score: 15 }, { id: "grade-2", score: 12 }];
    post.mockResolvedValueOnce({ data: { created: 2, grades: inserted } });
    const result = await gradesService.bulkCreateGrades("tenant-1", grades);
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith("/grades/bulk", { grades });
    expect(result).toEqual(inserted);
  });

  it("propagates a failed batch without retrying individual writes", async () => {
    post.mockRejectedValueOnce(new Error("HTTP 500"));
    await expect(gradesService.bulkCreateGrades("tenant-1", grades)).rejects.toThrow("HTTP 500");
    expect(post).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalledWith("/grades/", expect.anything());
  });

  it("does not bypass backend permission or validation failures", async () => {
    post.mockRejectedValueOnce(new Error("HTTP 403"));
    await expect(gradesService.bulkCreateGrades("tenant-1", grades)).rejects.toThrow("HTTP 403");
    expect(post).toHaveBeenCalledOnce();
  });

  it("propagates invalid-grade rejection instead of creating partial grades", async () => {
    post.mockRejectedValueOnce(new Error("HTTP 422"));
    await expect(gradesService.bulkCreateGrades("tenant-1", grades)).rejects.toThrow("HTTP 422");
    expect(post).toHaveBeenCalledOnce();
  });
});
