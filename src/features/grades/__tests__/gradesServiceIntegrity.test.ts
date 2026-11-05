import { beforeEach, describe, expect, it, vi } from "vitest";
const { get, post, put } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock("@/api/client", () => ({ apiClient: { get, post, put, delete: vi.fn() } }));
import { gradesService } from "../services/gradesService";

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { items: [] } });
  post.mockResolvedValue({ data: { id: "new-grade" } });
  put.mockResolvedValue({ data: { id: "existing-grade" } });
});

describe("grade read integrity", () => {
  it("propagates assessment listing errors instead of displaying no assessments", async () => {
    get.mockRejectedValueOnce(new Error("HTTP 503"));
    await expect(gradesService.listAssessments("tenant-1")).rejects.toThrow("HTTP 503");
  });

  it("propagates student grade errors instead of showing an invented zero average", async () => {
    get.mockRejectedValueOnce(new Error("HTTP 403"));
    await expect(gradesService.getStudentGrades("student-1")).rejects.toThrow("HTTP 403");
  });

  it("does not create a duplicate grade when the existence lookup fails", async () => {
    get.mockRejectedValueOnce(new Error("Network Error"));
    await expect(gradesService.upsertGrade("tenant-1", {
      student_id: "student-1", assessment_id: "assessment-1", score: 12,
    })).rejects.toThrow("Network Error");
    expect(post).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it("updates an existing grade following a successful lookup", async () => {
    get.mockResolvedValueOnce({ data: { items: [{ id: "grade-1", assessment_id: "assessment-1" }] } });
    await gradesService.upsertGrade("tenant-1", {
      student_id: "student-1", assessment_id: "assessment-1", score: 14,
    });
    expect(put).toHaveBeenCalledWith("/grades/grade-1/", expect.objectContaining({ score: 14 }));
    expect(post).not.toHaveBeenCalled();
  });

  it("creates a grade only after a successful empty lookup", async () => {
    await gradesService.upsertGrade("tenant-1", {
      student_id: "student-1", assessment_id: "assessment-1", score: 15,
    });
    expect(post).toHaveBeenCalledWith("/grades/", expect.objectContaining({ score: 15 }));
  });
});
